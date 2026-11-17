// server/routes/timeline.js
// DS16 Construction Schedule & Timeline Management API

const router = require('express').Router({ mergeParams: true });
const pool = require('../db');
const { authenticate } = require('../middleware/auth');
const { checkProjectAccess } = require('../middleware/accessControl');
const { generateDraftActivities, addCalendarDays, formatDateStr, parseDateStr } = require('../services/timelineGenerator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure upload storage for timeline evidence
const evidenceStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const projectId = req.params.projectId;
    const dir = path.join(__dirname, '..', 'uploads', 'projects', String(projectId), 'timeline_evidence');
    try {
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (e) {
      cb(e);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${Date.now()}_${cleanBase}${ext}`);
  }
});

const uploadEvidence = multer({
  storage: evidenceStorage,
  limits: { fileSize: 25 * 1024 * 1024 }
});

// Role helpers
const isManagement = (user) => {
  if (!user) return false;
  return ['admin', 'design_head', 'project_head', 'civil_engineer'].includes(user.role);
};

const requireManagement = (req, res, next) => {
  if (!isManagement(req.user)) {
    return res.status(403).json({ error: 'Management authorization required for this timeline operation' });
  }
  next();
};

// 1. GET /api/projects/:projectId/timeline/config
// Retrieve building schedule configuration, status, and versions
router.get('/config', authenticate, checkProjectAccess(), async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  try {
    const { rows: configRows } = await pool.query(
      'SELECT * FROM timeline_configurations WHERE project_id = $1',
      [projectId]
    );

    const { rows: versionRows } = await pool.query(
      'SELECT id, version_number, status, published_at, published_by, notes FROM timeline_versions WHERE project_id = $1 ORDER BY version_number DESC',
      [projectId]
    );

    let config = configRows[0];
    if (!config) {
      // Return default initial setup if not yet saved
      config = {
        project_id: projectId,
        floors_above_ground: 4,
        ground_floor_config: 'parking_and_rooms',
        has_terrace_tank_slab: true,
        parking_rooms_config: 'Standard',
        building_type: 'Residential Apartment',
        stages: ['Site Preparation', 'Substructure', 'Superstructure & Slab', 'Finishing & Services', 'Handover'],
        status: 'draft',
        published_version: 0
      };
    }

    res.json({ config, versions: versionRows });
  } catch (err) {
    console.error('Error fetching timeline config:', err);
    res.status(500).json({ error: 'Failed to fetch timeline configuration' });
  }
});

// 2. POST /api/projects/:projectId/timeline/config
// Save or update building timeline configuration
router.post('/config', authenticate, checkProjectAccess(), requireManagement, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const { floors_above_ground, ground_floor_config, has_terrace_tank_slab, parking_rooms_config, building_type, stages, settings } = req.body;

  try {
    const { rows } = await pool.query(
      `INSERT INTO timeline_configurations 
        (project_id, floors_above_ground, ground_floor_config, has_terrace_tank_slab, parking_rooms_config, building_type, stages, settings, created_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (project_id) DO UPDATE SET
         floors_above_ground = EXCLUDED.floors_above_ground,
         ground_floor_config = EXCLUDED.ground_floor_config,
         has_terrace_tank_slab = EXCLUDED.has_terrace_tank_slab,
         parking_rooms_config = EXCLUDED.parking_rooms_config,
         building_type = EXCLUDED.building_type,
         stages = COALESCE(EXCLUDED.stages, timeline_configurations.stages),
         settings = COALESCE(EXCLUDED.settings, timeline_configurations.settings),
         updated_at = NOW()
       RETURNING *`,
      [
        projectId,
        parseInt(floors_above_ground, 10) || 4,
        ground_floor_config || 'parking_and_rooms',
        has_terrace_tank_slab !== false,
        parking_rooms_config || 'Standard',
        building_type || 'Residential Apartment',
        stages ? JSON.stringify(stages) : null,
        settings ? JSON.stringify(settings) : '{}',
        req.user.id
      ]
    );

    // Record audit event
    await pool.query(
      `INSERT INTO timeline_audit_history (project_id, user_id, action, new_value)
       VALUES ($1, $2, 'UPDATE_CONFIG', $3)`,
      [projectId, req.user.id, JSON.stringify(rows[0])]
    );

    res.json({ config: rows[0], message: 'Timeline configuration saved successfully' });
  } catch (err) {
    console.error('Error saving timeline config:', err);
    res.status(500).json({ error: 'Failed to save timeline configuration' });
  }
});

// 3. POST /api/projects/:projectId/timeline/generate-draft
// Generate draft construction tasks according to building setup (does NOT overwrite published schedule)
router.post('/generate-draft', authenticate, checkProjectAccess(), requireManagement, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Retrieve project start date and configuration
    const { rows: projRows } = await client.query('SELECT start_date FROM projects WHERE id = $1', [projectId]);
    const { rows: confRows } = await client.query('SELECT * FROM timeline_configurations WHERE project_id = $1', [projectId]);

    const config = confRows[0] || {
      floors_above_ground: req.body.floors_above_ground || 4,
      ground_floor_config: req.body.ground_floor_config || 'parking_and_rooms',
      has_terrace_tank_slab: req.body.has_terrace_tank_slab !== false,
      start_date: req.body.start_date || projRows[0]?.start_date || new Date().toISOString().split('T')[0]
    };

    if (req.body.start_date) config.start_date = req.body.start_date;

    // Generate activities
    const draftActivities = generateDraftActivities(config);

    // Clear existing uncommitted draft tasks for this project
    await client.query('DELETE FROM timeline_tasks WHERE project_id = $1 AND is_draft = TRUE', [projectId]);

    const createdDraftTasks = [];
    const tempIdToDbId = {};

    for (const act of draftActivities) {
      const { rows: [insertedTask] } = await client.query(
        `INSERT INTO timeline_tasks 
          (project_id, task_name, category, construction_stage, floor_zone, planned_start_date, planned_finish_date, forecast_start_date, forecast_finish_date, is_milestone, metadata, duration_days, status, order_index, is_draft, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'Not Started', $13, TRUE, $14)
         RETURNING *`,
        [
          projectId,
          act.task_name,
          act.category,
          act.construction_stage,
          act.floor_zone,
          act.planned_start_date,
          act.planned_finish_date,
          act.forecast_start_date || act.planned_start_date,
          act.forecast_finish_date || act.planned_finish_date,
          Boolean(act.is_milestone),
          JSON.stringify(act.metadata || {}),
          act.duration_days,
          act.order_index,
          req.user.id
        ]
      );
      tempIdToDbId[act.temp_id] = insertedTask.id;
      createdDraftTasks.push({ ...insertedTask, predecessors: act.predecessors });
    }

    // Insert draft dependencies with configured dependency_type and lag_days
    for (const act of createdDraftTasks) {
      if (Array.isArray(act.predecessors)) {
        for (const pred of act.predecessors) {
          const predTempId = typeof pred === 'object' ? pred.predecessor_id : pred;
          const depType = typeof pred === 'object' ? (pred.type || 'FS') : 'FS';
          const lagDays = typeof pred === 'object' ? (pred.lag !== undefined ? pred.lag : 0) : 0;
          const predDbId = tempIdToDbId[predTempId];
          if (predDbId) {
            await client.query(
              `INSERT INTO timeline_task_dependencies (task_id, predecessor_task_id, dependency_type, lag_days)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT DO NOTHING`,
              [act.id, predDbId, depType, lagDays]
            );
          }
        }
      }
    }

    await client.query('COMMIT');

    res.json({
      message: `Generated ${createdDraftTasks.length} draft activities`,
      count: createdDraftTasks.length,
      tasks: createdDraftTasks
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error generating draft activities:', err);
    res.status(500).json({ error: 'Failed to generate draft activities' });
  } finally {
    client.release();
  }
});

// 4. POST /api/projects/:projectId/timeline/publish
// Transition draft tasks to published schedule, increment version, and record snapshot in a transaction
router.post('/publish', authenticate, checkProjectAccess(), requireManagement, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const { notes } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check draft tasks existence
    const { rows: draftTasks } = await client.query(
      `SELECT t.*, 
        COALESCE((SELECT json_agg(ttd.predecessor_task_id) FROM timeline_task_dependencies ttd WHERE ttd.task_id = t.id), '[]'::json) as predecessors
       FROM timeline_tasks t
       WHERE t.project_id = $1 AND t.is_draft = TRUE AND t.is_archived = FALSE
       ORDER BY t.order_index ASC`,
      [projectId]
    );

    if (draftTasks.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No draft activities available to publish. Generate or add tasks first.' });
    }

    // Get current version number
    const { rows: verRows } = await client.query(
      'SELECT COALESCE(MAX(version_number), 0) + 1 as next_version FROM timeline_versions WHERE project_id = $1',
      [projectId]
    );
    const nextVersion = parseInt(verRows[0].next_version, 10);

    // Fetch configuration snapshot
    const { rows: confRows } = await client.query(
      'SELECT * FROM timeline_configurations WHERE project_id = $1',
      [projectId]
    );

    // Archive previously published tasks to maintain version provenance
    await client.query(
      'UPDATE timeline_tasks SET is_archived = TRUE WHERE project_id = $1 AND is_draft = FALSE',
      [projectId]
    );

    // Record timeline version
    const { rows: [versionRecord] } = await client.query(
      `INSERT INTO timeline_versions 
        (project_id, version_number, configuration_snapshot, tasks_snapshot, status, published_by, notes)
       VALUES ($1, $2, $3, $4, 'published', $5, $6)
       RETURNING *`,
      [
        projectId,
        nextVersion,
        JSON.stringify(confRows[0] || {}),
        JSON.stringify(draftTasks),
        req.user.id,
        notes || `Published Schedule v${nextVersion}`
      ]
    );

    // Mark current draft tasks as published
    await client.query(
      `UPDATE timeline_tasks 
       SET is_draft = FALSE, version_id = $1, updated_at = NOW()
       WHERE project_id = $2 AND is_draft = TRUE`,
      [versionRecord.id, projectId]
    );

    // Update configuration status
    await client.query(
      `UPDATE timeline_configurations
       SET status = 'published', published_version = $1, updated_at = NOW()
       WHERE project_id = $2`,
      [nextVersion, projectId]
    );

    // Audit log
    await client.query(
      `INSERT INTO timeline_audit_history (project_id, user_id, action, new_value)
       VALUES ($1, $2, 'PUBLISH_SCHEDULE', $3)`,
      [projectId, req.user.id, JSON.stringify({ version: nextVersion, taskCount: draftTasks.length })]
    );

    await client.query('COMMIT');

    res.json({
      message: `Schedule v${nextVersion} published successfully`,
      version: versionRecord,
      published_version: nextVersion
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error publishing schedule:', err);
    res.status(500).json({ error: 'Failed to publish schedule' });
  } finally {
    client.release();
  }
});

// 5. GET /api/projects/:projectId/timeline/tasks
// List timeline tasks (active or draft) with assignees, dependencies, and overdue indicator
router.get('/tasks', authenticate, checkProjectAccess(), async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const { stage, category, status, show_draft, show_archived, search } = req.query;

  try {
    let query = `
      SELECT t.*,
        COALESCE(
          (SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'username', u.username, 'role', u.role))
           FROM timeline_task_assignments tta
           JOIN users u ON u.id = tta.user_id
           WHERE tta.task_id = t.id),
          '[]'::json
        ) as assignees,
        COALESCE(
          (SELECT json_agg(json_build_object('predecessor_id', ttd.predecessor_task_id, 'type', ttd.dependency_type, 'lag', ttd.lag_days, 'name', pt.task_name))
           FROM timeline_task_dependencies ttd
           JOIN timeline_tasks pt ON pt.id = ttd.predecessor_task_id
           WHERE ttd.task_id = t.id),
          '[]'::json
        ) as dependencies,
        COALESCE(
          (SELECT count(*)::int FROM timeline_task_evidence tte WHERE tte.task_id = t.id),
          0
        ) as evidence_count
      FROM timeline_tasks t
      WHERE t.project_id = $1
    `;
    const params = [projectId];

    if (show_draft === 'true') {
      query += ` AND t.is_draft = TRUE`;
    } else {
      query += ` AND t.is_draft = FALSE`;
    }

    if (show_archived === 'true') {
      query += ` AND t.is_archived = TRUE`;
    } else {
      query += ` AND t.is_archived = FALSE`;
    }

    if (stage) {
      params.push(stage);
      query += ` AND t.construction_stage = $${params.length}`;
    }

    if (category) {
      params.push(category);
      query += ` AND t.category = $${params.length}`;
    }

    if (status) {
      params.push(status);
      query += ` AND t.status = $${params.length}`;
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (LOWER(t.task_name) LIKE $${params.length} OR LOWER(COALESCE(t.floor_zone, '')) LIKE $${params.length} OR LOWER(COALESCE(t.remarks, '')) LIKE $${params.length})`;
    }

    query += ` ORDER BY t.order_index ASC, t.planned_start_date ASC`;

    const { rows } = await pool.query(query, params);

    // Calculate dynamic indicators (Overdue, Upcoming)
    const todayStr = new Date().toISOString().split('T')[0];
    const enrichedTasks = rows.map(t => {
      const plannedFinish = t.planned_finish_date ? formatDateStr(t.planned_finish_date) : null;
      const plannedStart = t.planned_start_date ? formatDateStr(t.planned_start_date) : null;
      const forecastStart = t.forecast_start_date ? formatDateStr(t.forecast_start_date) : plannedStart;
      const forecastFinish = t.forecast_finish_date ? formatDateStr(t.forecast_finish_date) : plannedFinish;

      const isOverdue = t.status !== 'Completed' && (forecastFinish || plannedFinish) && (forecastFinish || plannedFinish) < todayStr;
      const isUpcoming = t.status === 'Not Started' && (forecastStart || plannedStart) && (forecastStart || plannedStart) > todayStr;

      return {
        ...t,
        is_overdue: isOverdue,
        is_upcoming: isUpcoming,
        planned_start_date: plannedStart,
        planned_finish_date: plannedFinish,
        forecast_start_date: forecastStart,
        forecast_finish_date: forecastFinish,
        actual_start_date: t.actual_start_date ? formatDateStr(t.actual_start_date) : null,
        actual_finish_date: t.actual_finish_date ? formatDateStr(t.actual_finish_date) : null,
        is_milestone: Boolean(t.is_milestone),
        metadata: typeof t.metadata === 'string' ? JSON.parse(t.metadata) : (t.metadata || {})
      };
    });

    res.json({ tasks: enrichedTasks, count: enrichedTasks.length });
  } catch (err) {
    console.error('Error fetching timeline tasks:', err);
    res.status(500).json({ error: 'Failed to fetch timeline tasks' });
  }
});

// 6. POST /api/projects/:projectId/timeline/tasks
// Create an individual task
router.post('/tasks', authenticate, checkProjectAccess(), requireManagement, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const {
    task_name,
    category,
    construction_stage,
    floor_zone,
    planned_start_date,
    planned_finish_date,
    duration_days,
    status,
    remarks,
    cost_estimate,
    assignees,
    predecessors,
    is_draft
  } = req.body;

  if (!task_name || !planned_start_date || !planned_finish_date) {
    return res.status(400).json({ error: 'task_name, planned_start_date, and planned_finish_date are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get max order index
    const { rows: [maxOrder] } = await client.query(
      'SELECT COALESCE(MAX(order_index), 0) + 1 as next_order FROM timeline_tasks WHERE project_id = $1',
      [projectId]
    );

    const calcDuration = duration_days || Math.max(1, Math.round((new Date(planned_finish_date) - new Date(planned_start_date)) / (1000 * 60 * 60 * 24)) + 1);
    const forecastStart = req.body.forecast_start_date || planned_start_date;
    const forecastFinish = req.body.forecast_finish_date || planned_finish_date;
    const isMilestone = Boolean(req.body.is_milestone);
    const metadata = req.body.metadata ? JSON.stringify(req.body.metadata) : '{}';

    const { rows: [newTask] } = await client.query(
      `INSERT INTO timeline_tasks
        (project_id, task_name, category, construction_stage, floor_zone, planned_start_date, planned_finish_date, forecast_start_date, forecast_finish_date, is_milestone, metadata, duration_days, status, remarks, cost_estimate, order_index, is_draft, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13, 'Not Started'), $14, $15, $16, COALESCE($17, FALSE), $18)
       RETURNING *`,
      [
        projectId,
        task_name.trim(),
        category || 'General Civil Works',
        construction_stage || 'Superstructure & Slab',
        floor_zone || null,
        planned_start_date,
        planned_finish_date,
        forecastStart,
        forecastFinish,
        isMilestone,
        metadata,
        calcDuration,
        status || 'Not Started',
        remarks || null,
        parseFloat(cost_estimate) || 0,
        maxOrder.next_order,
        is_draft === true,
        req.user.id
      ]
    );

    // Assign users
    if (Array.isArray(assignees)) {
      for (const userId of assignees) {
        await client.query(
          `INSERT INTO timeline_task_assignments (task_id, user_id, assigned_by)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [newTask.id, userId, req.user.id]
        );
      }
    }

    // Dependencies
    if (Array.isArray(predecessors)) {
      for (const pred of predecessors) {
        const predId = typeof pred === 'object' ? pred.predecessor_id : pred;
        const lag = typeof pred === 'object' ? (pred.lag || 0) : 0;
        const depType = typeof pred === 'object' ? (pred.type || 'FS') : 'FS';
        if (predId && predId !== newTask.id) {
          await client.query(
            `INSERT INTO timeline_task_dependencies (task_id, predecessor_task_id, dependency_type, lag_days)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING`,
            [newTask.id, predId, depType, lag]
          );
        }
      }
    }

    // Audit log
    await client.query(
      `INSERT INTO timeline_audit_history (project_id, task_id, user_id, action, new_value)
       VALUES ($1, $2, $3, 'CREATE_TASK', $4)`,
      [projectId, newTask.id, req.user.id, JSON.stringify(newTask)]
    );

    await client.query('COMMIT');
    res.status(201).json({ task: newTask, message: 'Task created successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating task:', err);
    res.status(500).json({ error: 'Failed to create timeline task' });
  } finally {
    client.release();
  }
});

// 7. PATCH /api/projects/:projectId/timeline/tasks/:taskId
// Update task details (planned/actual dates, duration, status, assignees, remarks, etc.)
router.patch('/tasks/:taskId', authenticate, checkProjectAccess(), async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const taskId = parseInt(req.params.taskId, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [existingTask] } = await client.query(
      'SELECT * FROM timeline_tasks WHERE id = $1 AND project_id = $2',
      [taskId, projectId]
    );

    if (!existingTask) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Timeline task not found' });
    }

    // Check authorization: Employees can update actual progress / status if assigned; management can update all fields
    const { rows: assignmentRows } = await client.query(
      'SELECT 1 FROM timeline_task_assignments WHERE task_id = $1 AND user_id = $2',
      [taskId, req.user.id]
    );
    const isAssigned = assignmentRows.length > 0;
    const canManage = isManagement(req.user);

    if (!canManage && !isAssigned) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You are not authorized to update this task' });
    }

    const {
      task_name,
      category,
      construction_stage,
      floor_zone,
      planned_start_date,
      planned_finish_date,
      actual_start_date,
      actual_finish_date,
      duration_days,
      status,
      remarks,
      cost_estimate,
      order_index,
      assignees,
      predecessors
    } = req.body;

    // Strict field-level restrictions for non-management assigned employees
    if (!canManage) {
      const MANAGEMENT_ONLY_FIELDS = [
        'task_name', 'category', 'construction_stage', 'floor_zone',
        'planned_start_date', 'planned_finish_date', 'duration_days',
        'cost_estimate', 'order_index', 'assignees', 'predecessors',
        'is_draft', 'is_archived', 'version_id', 'catalogue_activity_id',
        'forecast_start_date', 'forecast_finish_date', 'is_milestone', 'metadata'
      ];
      const attemptedForbidden = MANAGEMENT_ONLY_FIELDS.filter(k => req.body[k] !== undefined);
      if (attemptedForbidden.length > 0) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          error: `Assigned employees cannot modify planned dates, assignments, dependencies, or administrative fields (${attemptedForbidden.join(', ')}). Only progress updates (status, actual dates, and remarks) are permitted.`
        });
      }
    }

    // Build update fields safely
    const updates = [];
    const params = [taskId, projectId];

    if (canManage) {
      if (task_name !== undefined) { params.push(task_name.trim()); updates.push(`task_name = $${params.length}`); }
      if (category !== undefined) { params.push(category); updates.push(`category = $${params.length}`); }
      if (construction_stage !== undefined) { params.push(construction_stage); updates.push(`construction_stage = $${params.length}`); }
      if (floor_zone !== undefined) { params.push(floor_zone); updates.push(`floor_zone = $${params.length}`); }
      if (planned_start_date !== undefined) { params.push(planned_start_date); updates.push(`planned_start_date = $${params.length}`); }
      if (planned_finish_date !== undefined) { params.push(planned_finish_date); updates.push(`planned_finish_date = $${params.length}`); }
      if (duration_days !== undefined) { params.push(duration_days); updates.push(`duration_days = $${params.length}`); }
      if (cost_estimate !== undefined) { params.push(parseFloat(cost_estimate) || 0); updates.push(`cost_estimate = $${params.length}`); }
      if (order_index !== undefined) { params.push(order_index); updates.push(`order_index = $${params.length}`); }
      if (req.body.forecast_start_date !== undefined) { params.push(req.body.forecast_start_date); updates.push(`forecast_start_date = $${params.length}`); }
      if (req.body.forecast_finish_date !== undefined) { params.push(req.body.forecast_finish_date); updates.push(`forecast_finish_date = $${params.length}`); }
      if (req.body.is_milestone !== undefined) { params.push(Boolean(req.body.is_milestone)); updates.push(`is_milestone = $${params.length}`); }
      if (req.body.metadata !== undefined) { params.push(JSON.stringify(req.body.metadata)); updates.push(`metadata = $${params.length}`); }
    }

    // Status and actual dates can be updated by either management or assigned staff
    if (status !== undefined) {
      if (!['Not Started', 'In Progress', 'Completed', 'On Hold'].includes(status)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid status value' });
      }
      params.push(status);
      updates.push(`status = $${params.length}`);

      // Auto-set actual start date when moved to In Progress if unset
      if (status === 'In Progress' && !existingTask.actual_start_date && !actual_start_date) {
        updates.push(`actual_start_date = CURRENT_DATE`);
      }
      // Auto-set actual finish date when Completed if unset
      if (status === 'Completed' && !existingTask.actual_finish_date && !actual_finish_date) {
        updates.push(`actual_finish_date = CURRENT_DATE`);
      }
    }

    if (actual_start_date !== undefined) {
      params.push(actual_start_date || null);
      updates.push(`actual_start_date = $${params.length}`);
    }

    if (actual_finish_date !== undefined) {
      params.push(actual_finish_date || null);
      updates.push(`actual_finish_date = $${params.length}`);
    }

    if (remarks !== undefined) {
      params.push(remarks);
      updates.push(`remarks = $${params.length}`);
    }

    updates.push('updated_at = NOW()');

    const updateQuery = `
      UPDATE timeline_tasks
      SET ${updates.join(', ')}
      WHERE id = $1 AND project_id = $2
      RETURNING *
    `;
    const { rows: [updatedTask] } = await client.query(updateQuery, params);

    // Dynamic Construction Trigger: Third-Floor Slab completion event
    const existingMeta = typeof existingTask.metadata === 'string' ? JSON.parse(existingTask.metadata || '{}') : (existingTask.metadata || {});
    const is3rdFloorSlabMilestone = Boolean(
      existingTask.is_milestone ||
      existingMeta.is_trigger_milestone ||
      existingMeta.milestone_code === 'SLAB_3RD_FLOOR' ||
      (existingTask.category === 'RCC Structural Construction' && existingTask.floor_zone === '3rd Floor' && existingTask.task_name.includes('3rd Floor'))
    );

    let forecastAdjustmentResult = null;

    if (is3rdFloorSlabMilestone) {
      // Fetch project building configuration
      const { rows: [conf] } = await client.query(
        'SELECT floors_above_ground FROM timeline_configurations WHERE project_id = $1',
        [projectId]
      );
      const totalFloors = conf ? parseInt(conf.floors_above_ground, 10) : 4;

      // FIXED BRICKWORK COMMENCEMENT RULE:
      // Applies for buildings with 3 or more floors above ground (totalFloors >= 3)
      if (totalFloors >= 3) {
        if (updatedTask.status === 'Completed') {
          const slabActualFinish = updatedTask.actual_finish_date ? formatDateStr(updatedTask.actual_finish_date) : formatDateStr(new Date());

          // Revised expected ground-floor brickwork start = Actual slab completion date + 1 calendar day
          const revisedBrickworkStart = formatDateStr(addCalendarDays(slabActualFinish, 1));

          // Fetch Ground Floor Brickwork task
          const { rows: [groundBrick] } = await client.query(
            `SELECT * FROM timeline_tasks
             WHERE project_id = $1
               AND is_archived = FALSE
               AND is_draft = $2
               AND (
                 metadata->>'is_ground_brickwork' = 'true'
                 OR (floor_zone = 'Ground Floor' AND category = 'Masonry & Brickwork')
               )
             ORDER BY order_index ASC
             LIMIT 1`,
            [projectId, updatedTask.is_draft]
          );

          if (groundBrick) {
            const isPhysicallyStarted = Boolean(groundBrick.actual_start_date || ['In Progress', 'Completed'].includes(groundBrick.status));
            const currentForecastStart = groundBrick.forecast_start_date ? formatDateStr(groundBrick.forecast_start_date) : formatDateStr(groundBrick.planned_start_date);

            // Only update forecast if brickwork has NOT physically started AND date has changed (idempotency)
            if (!isPhysicallyStarted && currentForecastStart !== revisedBrickworkStart) {
              const revisedBrickworkFinish = formatDateStr(addCalendarDays(revisedBrickworkStart, groundBrick.duration_days - 1));

              await client.query(
                `UPDATE timeline_tasks
                 SET forecast_start_date = $1, forecast_finish_date = $2, updated_at = NOW()
                 WHERE id = $3`,
                [revisedBrickworkStart, revisedBrickworkFinish, groundBrick.id]
              );

              // Record automated forecast recalculation in audit history
              await client.query(
                `INSERT INTO timeline_audit_history 
                  (project_id, task_id, user_id, action, old_value, new_value)
                 VALUES ($1, $2, $3, 'AUTOMATIC_FORECAST_CALCULATION', $4, $5)`,
                [
                  projectId,
                  groundBrick.id,
                  req.user.id,
                  JSON.stringify({
                    forecast_start_date: currentForecastStart,
                    planned_start_date: formatDateStr(groundBrick.planned_start_date)
                  }),
                  JSON.stringify({
                    forecast_start_date: revisedBrickworkStart,
                    forecast_finish_date: revisedBrickworkFinish,
                    trigger_task_id: taskId,
                    trigger_milestone: 'SLAB_3RD_FLOOR',
                    actual_slab_completion_date: slabActualFinish
                  })
                ]
              );

              forecastAdjustmentResult = {
                ground_brickwork_task_id: groundBrick.id,
                previous_forecast_start: currentForecastStart,
                revised_forecast_start: revisedBrickworkStart,
                revised_forecast_finish: revisedBrickworkFinish
              };
            }
          }
        } else if (existingTask.status === 'Completed' && updatedTask.status !== 'Completed') {
          // Reopening completed 3rd floor slab: revert Ground Floor Brickwork forecast back to planned baseline if not started
          const { rows: [groundBrick] } = await client.query(
            `SELECT * FROM timeline_tasks
             WHERE project_id = $1
               AND is_archived = FALSE
               AND is_draft = $2
               AND (
                 metadata->>'is_ground_brickwork' = 'true'
                 OR (floor_zone = 'Ground Floor' AND category = 'Masonry & Brickwork')
               )
             ORDER BY order_index ASC
             LIMIT 1`,
            [projectId, updatedTask.is_draft]
          );

          if (groundBrick && !groundBrick.actual_start_date && groundBrick.status === 'Not Started') {
            const baselineStart = formatDateStr(groundBrick.planned_start_date);
            const baselineFinish = formatDateStr(groundBrick.planned_finish_date);

            await client.query(
              `UPDATE timeline_tasks
               SET forecast_start_date = planned_start_date, forecast_finish_date = planned_finish_date, updated_at = NOW()
               WHERE id = $1`,
              [groundBrick.id]
            );

            await client.query(
              `INSERT INTO timeline_audit_history 
                (project_id, task_id, user_id, action, old_value, new_value)
               VALUES ($1, $2, $3, 'REVERT_FORECAST_ON_MILESTONE_REOPEN', $4, $5)`,
              [
                projectId,
                groundBrick.id,
                req.user.id,
                JSON.stringify({ forecast_start_date: formatDateStr(groundBrick.forecast_start_date) }),
                JSON.stringify({ forecast_start_date: baselineStart, reason: '3rd Floor Slab reopened' })
              ]
            );

            forecastAdjustmentResult = {
              ground_brickwork_task_id: groundBrick.id,
              reverted_to_baseline: baselineStart
            };
          }
        }
      }
    }

    // Update assignees if provided and user is management
    if (canManage && Array.isArray(assignees)) {
      await client.query('DELETE FROM timeline_task_assignments WHERE task_id = $1', [taskId]);
      for (const uid of assignees) {
        const { rows: [validUser] } = await client.query('SELECT id FROM users WHERE id = $1', [uid]);
        if (validUser) {
          await client.query(
            `INSERT INTO timeline_task_assignments (task_id, user_id, assigned_by)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [taskId, uid, req.user.id]
          );
        }
      }
    }

    // Update dependencies if provided and user is management (with strict cross-project protection)
    if (canManage && Array.isArray(predecessors)) {
      await client.query('DELETE FROM timeline_task_dependencies WHERE task_id = $1', [taskId]);
      for (const pred of predecessors) {
        const predId = typeof pred === 'object' ? pred.predecessor_id : pred;
        const lag = typeof pred === 'object' ? (pred.lag || 0) : 0;
        const depType = typeof pred === 'object' ? (pred.type || 'FS') : 'FS';
        if (predId && predId !== taskId) {
          // Cross-project protection: verify predecessor belongs to the same project
          const { rows: [validPred] } = await client.query(
            'SELECT id FROM timeline_tasks WHERE id = $1 AND project_id = $2',
            [predId, projectId]
          );
          if (!validPred) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Predecessor task ${predId} is invalid or does not belong to this project` });
          }

          await client.query(
            `INSERT INTO timeline_task_dependencies (task_id, predecessor_task_id, dependency_type, lag_days)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING`,
            [taskId, predId, depType, lag]
          );
        }
      }
    }

    // Audit log
    await client.query(
      `INSERT INTO timeline_audit_history (project_id, task_id, user_id, action, old_value, new_value)
       VALUES ($1, $2, $3, 'UPDATE_TASK', $4, $5)`,
      [projectId, taskId, req.user.id, JSON.stringify(existingTask), JSON.stringify(updatedTask)]
    );

    await client.query('COMMIT');
    res.json({
      task: updatedTask,
      forecast_adjustment: forecastAdjustmentResult,
      message: forecastAdjustmentResult ? 'Task updated and Ground Floor Brickwork forecast recalculated' : 'Task updated successfully'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating task:', err);
    res.status(500).json({ error: 'Failed to update timeline task' });
  } finally {
    client.release();
  }
});

// 8. DELETE /api/projects/:projectId/timeline/tasks/:taskId
// Archive or permanently delete task (Permanent delete restricted to admin)
router.delete('/tasks/:taskId', authenticate, checkProjectAccess(), requireManagement, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const taskId = parseInt(req.params.taskId, 10);
  const permanent = req.query.permanent === 'true';

  if (permanent && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only administrative users can permanently delete timeline tasks' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [existingTask] } = await client.query(
      'SELECT * FROM timeline_tasks WHERE id = $1 AND project_id = $2',
      [taskId, projectId]
    );

    if (!existingTask) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Task not found' });
    }

    if (permanent) {
      await client.query('DELETE FROM timeline_tasks WHERE id = $1', [taskId]);
      await client.query(
        `INSERT INTO timeline_audit_history (project_id, task_id, user_id, action, old_value)
         VALUES ($1, $2, $3, 'PERMANENT_DELETE_TASK', $4)`,
        [projectId, taskId, req.user.id, JSON.stringify(existingTask)]
      );
    } else {
      await client.query('UPDATE timeline_tasks SET is_archived = TRUE, updated_at = NOW() WHERE id = $1', [taskId]);
      await client.query(
        `INSERT INTO timeline_audit_history (project_id, task_id, user_id, action, old_value)
         VALUES ($1, $2, $3, 'ARCHIVE_TASK', $4)`,
        [projectId, taskId, req.user.id, JSON.stringify(existingTask)]
      );
    }

    await client.query('COMMIT');
    res.json({ message: permanent ? 'Task permanently deleted' : 'Task archived successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error deleting task:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  } finally {
    client.release();
  }
});

// 9. POST /api/projects/:projectId/timeline/tasks/:taskId/restore
// Restore an archived task (requires management)
router.post('/tasks/:taskId/restore', authenticate, checkProjectAccess(), requireManagement, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const taskId = parseInt(req.params.taskId, 10);

  try {
    const { rows: [restored] } = await pool.query(
      'UPDATE timeline_tasks SET is_archived = FALSE, updated_at = NOW() WHERE id = $1 AND project_id = $2 RETURNING *',
      [taskId, projectId]
    );

    if (!restored) {
      return res.status(404).json({ error: 'Task not found or does not belong to this project' });
    }

    await pool.query(
      `INSERT INTO timeline_audit_history (project_id, task_id, user_id, action, new_value)
       VALUES ($1, $2, $3, 'RESTORE_TASK', $4)`,
      [projectId, taskId, req.user.id, JSON.stringify(restored)]
    );

    res.json({ message: 'Task restored successfully', task: restored });
  } catch (err) {
    console.error('Error restoring task:', err);
    res.status(500).json({ error: 'Failed to restore task' });
  }
});

// 10. POST /api/projects/:projectId/timeline/tasks/:taskId/dependencies
// Dedicated dependency addition with strict same-project validation
router.post('/tasks/:taskId/dependencies', authenticate, checkProjectAccess(), requireManagement, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const taskId = parseInt(req.params.taskId, 10);
  const { predecessor_id, dependency_type = 'FS', lag_days = 0 } = req.body;

  if (!predecessor_id || parseInt(predecessor_id, 10) === taskId) {
    return res.status(400).json({ error: 'Valid predecessor task ID different from current task is required' });
  }

  const predId = parseInt(predecessor_id, 10);

  try {
    // Verify target task belongs to this project
    const { rows: [targetTask] } = await pool.query(
      'SELECT id FROM timeline_tasks WHERE id = $1 AND project_id = $2',
      [taskId, projectId]
    );
    if (!targetTask) return res.status(404).json({ error: 'Target task not found' });

    // Verify predecessor task belongs to the SAME project
    const { rows: [predTask] } = await pool.query(
      'SELECT id FROM timeline_tasks WHERE id = $1 AND project_id = $2',
      [predId, projectId]
    );
    if (!predTask) {
      return res.status(400).json({ error: `Predecessor task ${predId} does not belong to project ${projectId}` });
    }

    const { rows: [dep] } = await pool.query(
      `INSERT INTO timeline_task_dependencies (task_id, predecessor_task_id, dependency_type, lag_days)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (task_id, predecessor_task_id) DO UPDATE SET dependency_type = EXCLUDED.dependency_type, lag_days = EXCLUDED.lag_days
       RETURNING *`,
      [taskId, predId, dependency_type, parseInt(lag_days, 10) || 0]
    );

    res.status(201).json({ message: 'Dependency added successfully', dependency: dep });
  } catch (err) {
    console.error('Error adding dependency:', err);
    res.status(500).json({ error: 'Failed to add dependency' });
  }
});

// 11. DELETE /api/projects/:projectId/timeline/tasks/:taskId/dependencies/:predecessorId
// Remove a predecessor dependency
router.delete('/tasks/:taskId/dependencies/:predecessorId', authenticate, checkProjectAccess(), requireManagement, async (req, res) => {
  const taskId = parseInt(req.params.taskId, 10);
  const predId = parseInt(req.params.predecessorId, 10);

  try {
    await pool.query(
      'DELETE FROM timeline_task_dependencies WHERE task_id = $1 AND predecessor_task_id = $2',
      [taskId, predId]
    );
    res.json({ message: 'Dependency removed successfully' });
  } catch (err) {
    console.error('Error removing dependency:', err);
    res.status(500).json({ error: 'Failed to remove dependency' });
  }
});

// 12. POST /api/projects/:projectId/timeline/tasks/:taskId/evidence
// Upload site inspection photo or documentation evidence
router.post('/tasks/:taskId/evidence', authenticate, checkProjectAccess(), uploadEvidence.single('file'), async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const taskId = parseInt(req.params.taskId, 10);

  if (!req.file) {
    return res.status(400).json({ error: 'No evidence file uploaded' });
  }

  try {
    const { rows: [task] } = await pool.query(
      'SELECT id, task_name FROM timeline_tasks WHERE id = $1 AND project_id = $2',
      [taskId, projectId]
    );
    if (!task) {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Task not found in this project' });
    }

    const relPath = path.relative(path.join(__dirname, '..'), req.file.path).replace(/\\/g, '/');
    const { rows: [evidence] } = await pool.query(
      `INSERT INTO timeline_task_evidence (task_id, file_path, file_name, file_size, mime_type, notes, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [taskId, relPath, req.file.originalname, req.file.size, req.file.mimetype, req.body.notes || null, req.user.id]
    );

    await pool.query(
      `INSERT INTO timeline_audit_history (project_id, task_id, user_id, action, new_value)
       VALUES ($1, $2, $3, 'ATTACH_EVIDENCE', $4)`,
      [projectId, taskId, req.user.id, JSON.stringify({ file_name: req.file.originalname, file_id: evidence.id })]
    );

    res.status(201).json({ message: 'Evidence uploaded successfully', evidence });
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('Error uploading evidence:', err);
    res.status(500).json({ error: 'Failed to record evidence' });
  }
});

// 13. GET /api/projects/:projectId/timeline/tasks/:taskId/evidence
// List all evidence for a specific task
router.get('/tasks/:taskId/evidence', authenticate, checkProjectAccess(), async (req, res) => {
  const taskId = parseInt(req.params.taskId, 10);
  try {
    const { rows } = await pool.query(
      `SELECT tte.*, u.name as uploader_name, u.role as uploader_role
       FROM timeline_task_evidence tte
       LEFT JOIN users u ON u.id = tte.uploaded_by
       WHERE tte.task_id = $1
       ORDER BY tte.created_at DESC`,
      [taskId]
    );
    res.json({ evidence: rows });
  } catch (err) {
    console.error('Error fetching evidence:', err);
    res.status(500).json({ error: 'Failed to load task evidence' });
  }
});

// 14. GET /api/projects/:projectId/timeline/versions
// List all published revisions/versions of the project timeline
router.get('/versions', authenticate, checkProjectAccess(), async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  try {
    const { rows } = await pool.query(
      `SELECT tv.id, tv.version_number, tv.status, tv.published_at, tv.notes, u.name as published_by_name
       FROM timeline_versions tv
       LEFT JOIN users u ON u.id = tv.published_by
       WHERE tv.project_id = $1
       ORDER BY tv.version_number DESC`,
      [projectId]
    );
    res.json({ versions: rows });
  } catch (err) {
    console.error('Error fetching timeline versions:', err);
    res.status(500).json({ error: 'Failed to load timeline versions' });
  }
});

// 15. GET /api/projects/:projectId/timeline/versions/:versionNumber
// Retrieve full snapshot of a specific historical version
router.get('/versions/:versionNumber', authenticate, checkProjectAccess(), async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const versionNum = parseInt(req.params.versionNumber, 10);

  try {
    const { rows: [version] } = await pool.query(
      `SELECT tv.*, u.name as published_by_name
       FROM timeline_versions tv
       LEFT JOIN users u ON u.id = tv.published_by
       WHERE tv.project_id = $1 AND tv.version_number = $2`,
      [projectId, versionNum]
    );

    if (!version) return res.status(404).json({ error: 'Timeline version not found' });
    res.json({ version });
  } catch (err) {
    console.error('Error retrieving timeline version snapshot:', err);
    res.status(500).json({ error: 'Failed to load timeline version details' });
  }
});

// 16. GET /api/projects/:projectId/timeline/history
// Retrieve audit history of timeline changes (strictly restricted to management-authorised roles)
router.get('/history', authenticate, checkProjectAccess(), requireManagement, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const { limit = 50, offset = 0, task_id, action } = req.query;

  try {
    let whereClauses = ['tah.project_id = $1'];
    let params = [projectId];

    if (task_id) {
      params.push(parseInt(task_id, 10));
      whereClauses.push(`tah.task_id = $${params.length}`);
    }
    if (action) {
      params.push(action);
      whereClauses.push(`tah.action = $${params.length}`);
    }

    const countQuery = `SELECT count(*)::int as total FROM timeline_audit_history tah WHERE ${whereClauses.join(' AND ')}`;
    const { rows: [{ total }] } = await pool.query(countQuery, params);

    params.push(parseInt(limit, 10));
    const limitClause = `LIMIT $${params.length}`;
    params.push(parseInt(offset, 10));
    const offsetClause = `OFFSET $${params.length}`;

    const dataQuery = `
      SELECT tah.*, u.name as user_name, u.role as user_role, tt.task_name
      FROM timeline_audit_history tah
      LEFT JOIN users u ON u.id = tah.user_id
      LEFT JOIN timeline_tasks tt ON tt.id = tah.task_id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY tah.created_at DESC
      ${limitClause} ${offsetClause}
    `;

    const { rows } = await pool.query(dataQuery, params);
    res.json({ history: rows, total, limit: parseInt(limit, 10), offset: parseInt(offset, 10) });
  } catch (err) {
    console.error('Error fetching timeline history:', err);
    res.status(500).json({ error: 'Failed to fetch timeline activity history' });
  }
});

// 17. GET /api/projects/:projectId/timeline/templates
// List reusable construction templates
router.get('/templates', authenticate, checkProjectAccess(), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM construction_templates ORDER BY is_system DESC, name ASC'
    );
    res.json({ templates: rows });
  } catch (err) {
    console.error('Error listing templates:', err);
    res.status(500).json({ error: 'Failed to load construction templates' });
  }
});

// 18. POST /api/projects/:projectId/timeline/templates/save-from-project
// Save current project's timeline structure as a new reusable template (requires management)
router.post('/templates/save-from-project', authenticate, checkProjectAccess(), requireManagement, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const { name, description, building_type } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Template name is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [config] } = await client.query(
      'SELECT * FROM timeline_configurations WHERE project_id = $1',
      [projectId]
    );

    const { rows: tasks } = await client.query(
      'SELECT * FROM timeline_tasks WHERE project_id = $1 AND is_archived = FALSE ORDER BY order_index ASC',
      [projectId]
    );

    if (tasks.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Project has no timeline tasks to save as a template' });
    }

    const { rows: [tmpl] } = await client.query(
      `INSERT INTO construction_templates (name, description, building_type, default_floors, default_config, is_system, created_by)
       VALUES ($1, $2, $3, $4, $5, FALSE, $6)
       RETURNING *`,
      [
        name.trim(),
        description || `Generated from Project #${projectId}`,
        building_type || config?.building_type || 'Residential Apartment',
        config?.floors_above_ground || 4,
        JSON.stringify(config?.settings || {}),
        req.user.id
      ]
    );

    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      await client.query(
        `INSERT INTO construction_template_activities 
          (template_id, category, activity_name, stage_name, default_duration_days, order_index)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [tmpl.id, t.category, t.task_name, t.construction_stage, t.duration_days, i + 1]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Template saved successfully', template: tmpl });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error saving template from project:', err);
    res.status(500).json({ error: 'Failed to save template' });
  } finally {
    client.release();
  }
});

module.exports = router;
