// server/tests/uploadsSecurity.test.js
// Tests for Phase 2: Secure /uploads route authentication, traversal prevention, and safe headers

const request = require('supertest');
const app = require('../index');
const pool = require('../db');
const { signToken } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

describe('Phase 2: Secure /uploads delivery', () => {
  let testUserId;
  let validToken;
  const testDir = path.join(__dirname, '..', 'uploads', 'test_security');
  const testImagePath = path.join(testDir, 'test_image.png');
  const testSvgPath = path.join(testDir, 'test_vector.svg');

  beforeAll(async () => {
    // Create test user in DB
    const { rows } = await pool.query(`
      INSERT INTO users (username, password_hash, name, role, department, is_active)
      VALUES ('upload_test_user', 'hash123', 'Upload Tester', 'admin', 'Management', TRUE)
      ON CONFLICT (username) DO UPDATE SET is_active = TRUE
      RETURNING id
    `);
    testUserId = rows[0].id;
    validToken = signToken(testUserId);

    // Create test directory and files
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(testImagePath, 'fake-png-binary-data');
    fs.writeFileSync(testSvgPath, '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>');
  });

  afterAll(async () => {
    // Cleanup test files
    try {
      if (fs.existsSync(testImagePath)) fs.unlinkSync(testImagePath);
      if (fs.existsSync(testSvgPath)) fs.unlinkSync(testSvgPath);
      if (fs.existsSync(testDir)) fs.rmdirSync(testDir);
    } catch (_) {}

    // Cleanup test user
    if (testUserId) {
      await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
  });

  test('1. Reject unauthenticated request to /uploads with 401', async () => {
    const res = await request(app).get('/uploads/test_security/test_image.png');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/No token provided/i);
  });

  test('2. Allow authenticated request with Bearer header & serve inline for image', async () => {
    const res = await request(app)
      .get('/uploads/test_security/test_image.png')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-disposition']).toBe('inline; filename="test_image.png"');
    expect(res.body.toString()).toBe('fake-png-binary-data');
  });

  test('3. Allow authenticated request with HTTP-only cookie (browser <img> tag behavior)', async () => {
    const res = await request(app)
      .get('/uploads/test_security/test_image.png')
      .set('Cookie', `ds16_token=${validToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-disposition']).toBe('inline; filename="test_image.png"');
    expect(res.body.toString()).toBe('fake-png-binary-data');
  });

  test('4. Allow authenticated request with ?token= query param fallback', async () => {
    const res = await request(app)
      .get(`/uploads/test_security/test_image.png?token=${validToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.body.toString()).toBe('fake-png-binary-data');
  });

  test('5. Enforce forced download (attachment) on SVG files to prevent Stored XSS', async () => {
    const res = await request(app)
      .get('/uploads/test_security/test_vector.svg')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-disposition']).toBe('attachment; filename="test_vector.svg"');
  });

  test('6. Block path traversal attempts with 403 or 404', async () => {
    // Encoded traversal attempt that reaches Express
    const res = await request(app)
      .get('/uploads/%2e%2e%2f%2e%2e%2fpackage.json')
      .set('Authorization', `Bearer ${validToken}`);

    expect([403, 404]).toContain(res.status);
    if (res.status === 403) {
      expect(res.body.error).toMatch(/Access denied/i);
    }
  });

  test('7. Return 404 for non-existent file', async () => {
    const res = await request(app)
      .get('/uploads/test_security/non_existent_file.pdf')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('File not found');
  });
});
