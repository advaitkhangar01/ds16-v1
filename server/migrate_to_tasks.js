require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('127.0.0.1')) 
    ? { rejectUnauthorized: false } 
    : false,
});

function getStageFromProjectStatus(status) {
  if (!status) return 'proposal';
  const s = status.toLowerCase();
  if (s.includes('proposal') || s.includes('design')) return 'proposal';
  if (s.includes('execution') || s.includes('working')) return 'execution';
  if (s.includes('completed')) return 'completed';
  if (s.includes('sanction') || s.includes('submit')) return 'sanction';
  return 'proposal';
}

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('1. Creating tasks table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        stage VARCHAR(50) NOT NULL DEFAULT 'proposal',
        title VARCHAR(255) NOT NULL,
        description TEXT,
        assigned_to INTEGER REFERENCES users(id),
        created_by INTEGER REFERENCES users(id),
        status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'review', 'done')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    console.log('2. Creating task_participants table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_participants (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        added_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(task_id, user_id)
      )
    `);

    console.log('3. Creating task_messages table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_messages (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        sender_id INTEGER REFERENCES users(id),
        message TEXT NOT NULL,
        mentions JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    console.log('4. Fetching existing data for migration...');
    const { rows: comments } = await client.query('SELECT * FROM comments ORDER BY created_at ASC');
    const { rows: projects } = await client.query('SELECT id, status FROM projects');
    
    const projectMap = {};
    projects.forEach(p => {
      projectMap[p.id] = p;
    });

    // Group comments by project
    const projectComments = {};
    comments.forEach(c => {
      if (!projectComments[c.project_id]) projectComments[c.project_id] = [];
      projectComments[c.project_id].push(c);
    });

    console.log(`Processing comments for ${Object.keys(projectComments).length} projects...`);

    for (const projectId of Object.keys(projectComments)) {
      const proj = projectMap[projectId] || { status: 'proposal' };
      const stage = getStageFromProjectStatus(proj.status);
      const projectComms = projectComments[projectId];

      // Separate into threads (root comments)
      const roots = projectComms.filter(c => !c.parent_id);
      const replies = projectComms.filter(c => c.parent_id);

      // We will group general remarks (assigned_to is null) into one single task per project
      const generalComments = [];
      const assignedThreads = [];

      roots.forEach(root => {
        if (root.assigned_to) {
          assignedThreads.push(root);
        } else {
          // Check if any reply is assigned
          const threadReplies = replies.filter(r => r.parent_id === root.id);
          const assignedReply = threadReplies.find(r => r.assigned_to);
          if (assignedReply) {
            root.assigned_to = assignedReply.assigned_to; // adopt assignee
            assignedThreads.push(root);
          } else {
            generalComments.push(root);
          }
        }
      });

      // 1. Migrate Assigned Threads (as individual Tasks)
      // Deduplicate similar assigned threads
      const tasksToCreate = [];
      assignedThreads.forEach(root => {
        const title = root.message.substring(0, 100).trim() || 'Untitled Task';
        const similar = tasksToCreate.find(t => 
          t.assigned_to === root.assigned_to && 
          t.title.substring(0, 30) === title.substring(0, 30)
        );

        if (similar) {
          // Merge into similar
          similar.originalRoots.push(root);
        } else {
          tasksToCreate.push({
            project_id: projectId,
            stage: stage,
            title: title,
            assigned_to: root.assigned_to,
            created_by: root.user_id,
            status: root.task_status === 'completed' ? 'done' : root.task_status || 'pending',
            created_at: root.created_at,
            originalRoots: [root]
          });
        }
      });

      for (const t of tasksToCreate) {
        // Insert task
        const { rows: [task] } = await client.query(`
          INSERT INTO tasks (project_id, stage, title, assigned_to, created_by, status, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
          RETURNING id
        `, [t.project_id, t.stage, t.title, t.assigned_to, t.created_by, t.status, t.created_at]);

        // Insert participants
        const participants = new Set();
        if (t.assigned_to) participants.add(t.assigned_to);
        if (t.created_by) participants.add(t.created_by);

        // Add participants from messages
        t.originalRoots.forEach(root => {
          participants.add(root.user_id);
          const threadReplies = replies.filter(r => r.parent_id === root.id);
          threadReplies.forEach(r => participants.add(r.user_id));
        });

        for (const userId of participants) {
          await client.query(`
            INSERT INTO task_participants (task_id, user_id, added_by, created_at)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (task_id, user_id) DO NOTHING
          `, [task.id, userId, t.created_by, t.created_at]);
        }

        // Insert messages
        for (const root of t.originalRoots) {
          // Root message
          await client.query(`
            INSERT INTO task_messages (task_id, sender_id, message, created_at)
            VALUES ($1, $2, $3, $4)
          `, [task.id, root.user_id, root.message, root.created_at]);

          // Replies
          const threadReplies = replies.filter(r => r.parent_id === root.id);
          for (const r of threadReplies) {
            await client.query(`
              INSERT INTO task_messages (task_id, sender_id, message, created_at)
              VALUES ($1, $2, $3, $4)
            `, [task.id, r.user_id, r.message, r.created_at]);
          }
        }
      }

      // 2. Migrate General Comments (Group into single "General Remarks" task)
      if (generalComments.length > 0) {
        const { rows: [task] } = await client.query(`
          INSERT INTO tasks (project_id, stage, title, description, assigned_to, created_by, status, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
          RETURNING id
        `, [projectId, stage, 'General Remarks', 'All previously unassigned discussion threads.', null, generalComments[0].user_id, 'in_progress', generalComments[0].created_at]);

        const participants = new Set();
        generalComments.forEach(root => {
          participants.add(root.user_id);
          const threadReplies = replies.filter(r => r.parent_id === root.id);
          threadReplies.forEach(r => participants.add(r.user_id));
        });

        for (const userId of participants) {
          await client.query(`
            INSERT INTO task_participants (task_id, user_id, added_by, created_at)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (task_id, user_id) DO NOTHING
          `, [task.id, userId, generalComments[0].user_id, generalComments[0].created_at]);
        }

        for (const root of generalComments) {
          await client.query(`
            INSERT INTO task_messages (task_id, sender_id, message, created_at)
            VALUES ($1, $2, $3, $4)
          `, [task.id, root.user_id, root.message, root.created_at]);

          const threadReplies = replies.filter(r => r.parent_id === root.id);
          for (const r of threadReplies) {
            await client.query(`
              INSERT INTO task_messages (task_id, sender_id, message, created_at)
              VALUES ($1, $2, $3, $4)
            `, [task.id, r.user_id, r.message, r.created_at]);
          }
        }
      }
    }

    await client.query('COMMIT');
    console.log('✅ Migration successful! All tasks migrated safely.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err);
  } finally {
    client.release();
    pool.end();
  }
}

run();
