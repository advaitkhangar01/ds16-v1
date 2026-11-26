// server/tests/timelinePlannedVsActualAndPhoto.test.js
// Integration test suite for Planned vs Actual Execution Dates and Activity-Level Photo Evidence

const request = require('supertest');
const app = require('../index');
const pool = require('../db');
const { signToken } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

// Helper to format date in local YYYY-MM-DD
const toLocalYMD = (val) => {
  if (!val) return null;
  const d = new Date(val);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

describe('DS16 — Timeline Planned vs Actual Execution & Activity Photo Evidence', () => {
  let adminUser = null;
  let adminToken = null;
  let employeeUser = null;
  let employeeToken = null;
  let unassignedEmpUser = null;
  let unassignedEmpToken = null;
  let testProject = null;
  let otherProject = null;
  let testClientId = null;
  let testTask = null;
  let otherProjectTask = null;

  beforeAll(async () => {
    // 1. Create client
    const { rows: clientRows } = await pool.query(
      `INSERT INTO clients (name, email) VALUES ('Photo Test Client', 'client_photo@test.com') RETURNING id`
    );
    testClientId = clientRows[0].id;

    // 2. Create users
    await pool.query("DELETE FROM users WHERE username LIKE 'photo_test_%'");

    const { rows: adminRows } = await pool.query(
      `INSERT INTO users (name, role, username, password_hash)
       VALUES ('Photo Test Admin', 'admin', 'photo_test_admin', 'hash') RETURNING id, role`
    );
    adminUser = adminRows[0];
    adminToken = signToken(adminUser.id);

    const { rows: empRows } = await pool.query(
      `INSERT INTO users (name, role, username, password_hash)
       VALUES ('Photo Test Emp', 'employee', 'photo_test_emp', 'hash') RETURNING id, role`
    );
    employeeUser = empRows[0];
    employeeToken = signToken(employeeUser.id);

    const { rows: unassignedRows } = await pool.query(
      `INSERT INTO users (name, role, username, password_hash)
       VALUES ('Photo Unassigned Emp', 'employee', 'photo_test_unassigned', 'hash') RETURNING id, role`
    );
    unassignedEmpUser = unassignedRows[0];
    unassignedEmpToken = signToken(unassignedEmpUser.id);

    // 3. Create test projects
    const { rows: p1 } = await pool.query(
      `INSERT INTO projects (name, client_id, type, status, created_by, client_name, start_date)
       VALUES ('Photo Test Project A', $1, 'Residential Apartment', 'In Progress', $2, 'Photo Test Client', '2026-11-01')
       RETURNING *`,
      [testClientId, adminUser.id]
    );
    testProject = p1[0];

    const { rows: p2 } = await pool.query(
      `INSERT INTO projects (name, client_id, type, status, created_by, client_name, start_date)
       VALUES ('Photo Test Project B', $1, 'Commercial Complex', 'In Progress', $2, 'Photo Test Client', '2026-11-01')
       RETURNING *`,
      [testClientId, adminUser.id]
    );
    otherProject = p2[0];

    // Assign admin and employee to testProject
    await pool.query(
      `INSERT INTO project_assignments (project_id, user_id)
       VALUES ($1, $2), ($1, $3)
       ON CONFLICT DO NOTHING`,
      [testProject.id, adminUser.id, employeeUser.id]
    );

    // 4. Create tasks
    const { rows: t1 } = await pool.query(
      `INSERT INTO timeline_tasks
        (project_id, task_name, category, section_name, construction_stage, floor_zone, planned_start_date, planned_finish_date, duration_days, status, order_index, is_draft, created_by)
       VALUES
        ($1, 'Ground Floor RCC Columns', 'Structural Works', 'Superstructure', 'Superstructure & Slab', 'Ground Floor', '2026-11-05', '2026-11-15', 11, 'Not Started', 1, FALSE, $2)
       RETURNING *`,
      [testProject.id, adminUser.id]
    );
    testTask = t1[0];

    // Assign employee to testTask
    await pool.query(
      `INSERT INTO timeline_task_assignments (task_id, user_id, assigned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [testTask.id, employeeUser.id, adminUser.id]
    );

    const { rows: t2 } = await pool.query(
      `INSERT INTO timeline_tasks
        (project_id, task_name, category, section_name, construction_stage, floor_zone, planned_start_date, planned_finish_date, duration_days, status, order_index, is_draft, created_by)
       VALUES
        ($1, 'Other Project Task', 'Structural Works', 'Superstructure', 'Superstructure & Slab', 'First Floor', '2026-11-05', '2026-11-15', 11, 'Not Started', 1, FALSE, $2)
       RETURNING *`,
      [otherProject.id, adminUser.id]
    );
    otherProjectTask = t2[0];
  });

  afterAll(async () => {
    // Clean up files created during test
    const photoDir = path.join(__dirname, '..', 'uploads', 'projects', String(testProject?.id), 'timeline_photos');
    if (fs.existsSync(photoDir)) {
      try {
        fs.rmSync(photoDir, { recursive: true, force: true });
      } catch (_) {}
    }

    if (testProject) {
      await pool.query('DELETE FROM projects WHERE id IN ($1, $2)', [testProject.id, otherProject?.id]);
    }
    if (testClientId) {
      await pool.query('DELETE FROM clients WHERE id = $1', [testClientId]);
    }
    await pool.query("DELETE FROM users WHERE username LIKE 'photo_test_%'");
  });

  // ─── 1. Planned vs Actual Execution Dates ────────────────────────────────────

  test('1. Valid actual execution date entry (both start and finish)', async () => {
    const res = await request(app)
      .patch(`/api/projects/${testProject.id}/timeline/tasks/${testTask.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        actual_start_date: '2026-11-07',
        actual_finish_date: '2026-11-18'
      });

    expect(res.status).toBe(200);
    expect(toLocalYMD(res.body.task.actual_start_date)).toBe('2026-11-07');
    expect(toLocalYMD(res.body.task.actual_finish_date)).toBe('2026-11-18');
  });

  test('2. Ongoing activity: actual start recorded without actual finish', async () => {
    const res = await request(app)
      .patch(`/api/projects/${testProject.id}/timeline/tasks/${testTask.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        actual_start_date: '2026-11-07',
        actual_finish_date: null
      });

    expect(res.status).toBe(200);
    expect(toLocalYMD(res.body.task.actual_start_date)).toBe('2026-11-07');
    expect(res.body.task.actual_finish_date).toBeNull();
  });

  test('3. Invalid date sequence rejection: actual finish earlier than actual start returns 400', async () => {
    const res = await request(app)
      .patch(`/api/projects/${testProject.id}/timeline/tasks/${testTask.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        actual_start_date: '2026-11-10',
        actual_finish_date: '2026-11-05'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot precede actual start date/i);
  });

  test('4. Marking activity Completed does NOT auto-fill or overwrite actual finish date', async () => {
    // Reset actual_finish_date to null
    await pool.query('UPDATE timeline_tasks SET actual_finish_date = NULL WHERE id = $1', [testTask.id]);

    const res = await request(app)
      .patch(`/api/projects/${testProject.id}/timeline/tasks/${testTask.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'Completed'
      });

    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe('Completed');
    expect(res.body.task.actual_finish_date).toBeNull();
  });

  test('5. Updating actual dates does NOT mutate or recalculate planned dates', async () => {
    const originalPlannedStart = '2026-11-05';
    const originalPlannedFinish = '2026-11-15';

    const res = await request(app)
      .patch(`/api/projects/${testProject.id}/timeline/tasks/${testTask.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        actual_start_date: '2026-11-12',
        actual_finish_date: '2026-11-25'
      });

    expect(res.status).toBe(200);
    expect(toLocalYMD(res.body.task.planned_start_date)).toBe(originalPlannedStart);
    expect(toLocalYMD(res.body.task.planned_finish_date)).toBe(originalPlannedFinish);
    expect(toLocalYMD(res.body.task.actual_start_date)).toBe('2026-11-12');
    expect(toLocalYMD(res.body.task.actual_finish_date)).toBe('2026-11-25');
  });

  test('6. Updating planned dates does NOT mutate or clear actual dates', async () => {
    const res = await request(app)
      .patch(`/api/projects/${testProject.id}/timeline/tasks/${testTask.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        planned_start_date: '2026-11-01',
        planned_finish_date: '2026-11-10'
      });

    expect(res.status).toBe(200);
    expect(toLocalYMD(res.body.task.planned_start_date)).toBe('2026-11-01');
    expect(toLocalYMD(res.body.task.planned_finish_date)).toBe('2026-11-10');
    // Actual dates remain unchanged
    expect(toLocalYMD(res.body.task.actual_start_date)).toBe('2026-11-12');
    expect(toLocalYMD(res.body.task.actual_finish_date)).toBe('2026-11-25');
  });

  // ─── 2. Photo Upload & Lifecycle ─────────────────────────────────────────────

  test('7. Photo upload succeeds for valid image (JPEG/PNG/WebP <= 5 MB)', async () => {
    // Valid JPEG buffer with standard JFIF header
    const jpegBuffer = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43
    ]);

    const res = await request(app)
      .post(`/api/projects/${testProject.id}/timeline/tasks/${testTask.id}/photo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('photo', jpegBuffer, { filename: 'site_column_pour.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.photo).toBeDefined();
    expect(res.body.photo.photo_name).toBe('site_column_pour.jpg');
    expect(res.body.photo.photo_mime).toBe('image/jpeg');
    expect(res.body.photo.photo_path).toMatch(/^uploads\/projects\/\d+\/timeline_photos\/photo_/);

    // Verify DB columns
    const { rows: [dbTask] } = await pool.query(
      'SELECT photo_path, photo_name, photo_mime, photo_size FROM timeline_tasks WHERE id = $1',
      [testTask.id]
    );
    expect(dbTask.photo_path).toBe(res.body.photo.photo_path);
    expect(dbTask.photo_name).toBe('site_column_pour.jpg');

    // Verify physical file exists on disk
    const absPath = path.resolve(__dirname, '..', dbTask.photo_path);
    expect(fs.existsSync(absPath)).toBe(true);
  });

  test('8. Photo upload rejected when file exceeds 5 MB', async () => {
    // Create oversized buffer (5.2 MB)
    const largeBuffer = Buffer.alloc(5.2 * 1024 * 1024);
    // Add valid JPEG header
    largeBuffer[0] = 0xFF;
    largeBuffer[1] = 0xD8;
    largeBuffer[2] = 0xFF;

    const res = await request(app)
      .post(`/api/projects/${testProject.id}/timeline/tasks/${testTask.id}/photo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('photo', largeBuffer, { filename: 'too_large.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exceeds maximum 5 MB limit/i);
  });

  test('9. Photo upload rejected when file is not a valid image (fake extension / magic bytes mismatch)', async () => {
    // Text buffer disguised as a PNG
    const fakeBuffer = Buffer.from('This is a fake text file disguised as a picture.');

    const res = await request(app)
      .post(`/api/projects/${testProject.id}/timeline/tasks/${testTask.id}/photo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('photo', fakeBuffer, { filename: 'fake_virus.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid or corrupted image file signature/i);
  });

  test('10. Photo replacement unlinks previous file from disk and updates DB record atomically', async () => {
    // Fetch old photo path
    const { rows: [initialTask] } = await pool.query(
      'SELECT photo_path FROM timeline_tasks WHERE id = $1',
      [testTask.id]
    );
    const oldAbsPath = path.resolve(__dirname, '..', initialTask.photo_path);
    expect(fs.existsSync(oldAbsPath)).toBe(true);

    // Valid PNG buffer
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01
    ]);

    const res = await request(app)
      .post(`/api/projects/${testProject.id}/timeline/tasks/${testTask.id}/photo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('photo', pngBuffer, { filename: 'replacement_photo.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.photo.photo_name).toBe('replacement_photo.png');
    expect(res.body.photo.photo_path).not.toBe(initialTask.photo_path);

    // Check that previous file was safely unlinked
    expect(fs.existsSync(oldAbsPath)).toBe(false);

    // Check that new file exists on disk
    const newAbsPath = path.resolve(__dirname, '..', res.body.photo.photo_path);
    expect(fs.existsSync(newAbsPath)).toBe(true);

    // Check audit history logged REPLACE_PHOTO
    const { rows: auditRows } = await pool.query(
      `SELECT action, new_value FROM timeline_audit_history WHERE task_id = $1 AND action = 'REPLACE_PHOTO' ORDER BY created_at DESC LIMIT 1`,
      [testTask.id]
    );
    expect(auditRows.length).toBe(1);
    expect(auditRows[0].action).toBe('REPLACE_PHOTO');
  });

  test('11. Photo removal unlinks file from disk and nullifies DB columns', async () => {
    const { rows: [taskBefore] } = await pool.query(
      'SELECT photo_path FROM timeline_tasks WHERE id = $1',
      [testTask.id]
    );
    const fileAbsPath = path.resolve(__dirname, '..', taskBefore.photo_path);
    expect(fs.existsSync(fileAbsPath)).toBe(true);

    const res = await request(app)
      .delete(`/api/projects/${testProject.id}/timeline/tasks/${testTask.id}/photo`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/removed successfully/i);

    // Check that file on disk is deleted
    expect(fs.existsSync(fileAbsPath)).toBe(false);

    // Check DB columns are NULL
    const { rows: [taskAfter] } = await pool.query(
      'SELECT photo_path, photo_name, photo_size, photo_mime, photo_uploaded_at FROM timeline_tasks WHERE id = $1',
      [testTask.id]
    );
    expect(taskAfter.photo_path).toBeNull();
    expect(taskAfter.photo_name).toBeNull();
    expect(taskAfter.photo_size).toBeNull();
    expect(taskAfter.photo_mime).toBeNull();
    expect(taskAfter.photo_uploaded_at).toBeNull();

    // Check audit history logged REMOVE_PHOTO
    const { rows: auditRows } = await pool.query(
      `SELECT action FROM timeline_audit_history WHERE task_id = $1 AND action = 'REMOVE_PHOTO' ORDER BY created_at DESC LIMIT 1`,
      [testTask.id]
    );
    expect(auditRows.length).toBe(1);
  });

  // ─── 3. Access Control & Authorization ───────────────────────────────────────

  test('12. Access control: unauthorized user / unassigned employee / cross-project request blocked', async () => {
    const validJpg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00]);

    // Unassigned employee cannot upload photo to project A
    const resUnassigned = await request(app)
      .post(`/api/projects/${testProject.id}/timeline/tasks/${testTask.id}/photo`)
      .set('Authorization', `Bearer ${unassignedEmpToken}`)
      .attach('photo', validJpg, { filename: 'unauth.jpg', contentType: 'image/jpeg' });

    expect([401, 403]).toContain(resUnassigned.status);

    // Unassigned employee cannot delete photo
    const resDeleteUnassigned = await request(app)
      .delete(`/api/projects/${testProject.id}/timeline/tasks/${testTask.id}/photo`)
      .set('Authorization', `Bearer ${unassignedEmpToken}`);

    expect([401, 403]).toContain(resDeleteUnassigned.status);

    // Cross-project protection: task belonging to project B cannot be targeted under project A's route
    const resCross = await request(app)
      .post(`/api/projects/${testProject.id}/timeline/tasks/${otherProjectTask.id}/photo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('photo', validJpg, { filename: 'cross.jpg', contentType: 'image/jpeg' });

    expect(resCross.status).toBe(404);
    expect(resCross.body.error).toMatch(/Task not found in this project/i);
  });
});
