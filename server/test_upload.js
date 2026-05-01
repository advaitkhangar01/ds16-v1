// scripts/test_upload.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data'); // You will probably need this dependency if you run this in Node

async function runTests() {
  try {
    console.log('--- Document Upload Verification ---');
    
    // 1. Login to get token
    console.log('1. Logging in as admin...');
    const loginRes = await axios.post('http://localhost:3001/api/auth/login', {
      username: 'abhijit',
      password: 'DS16_admin_secure' // Correct password from DB seed
    });
    
    const token = loginRes.data.token;
    console.log('Login successful. Token acquired.');

    // config with auth header
    const config = {
      headers: { Authorization: `Bearer ${token}` }
    };

    // 2. Fetch projects to get a project ID
    const projectsRes = await axios.get('http://localhost:3001/api/projects', config);
    const projectId = projectsRes.data.projects[0].id; // Grabbing the first project
    console.log(`2. Using Project ID: ${projectId}`);

    // Create a dummy file
    const testFilePath = path.join(__dirname, 'test_file.txt');
    fs.writeFileSync(testFilePath, 'Hello World! This is a test file.');
    
    // 3. Upload file
    console.log('3. Uploading file...');
    const formData = new FormData();
    formData.append('project_id', projectId);
    formData.append('remark', 'Test remark from automated verification');
    formData.append('file', fs.createReadStream(testFilePath));

    const uploadRes = await axios.post('http://localhost:3001/api/documents/upload', formData, {
      headers: { 
        ...config.headers, 
        ...formData.getHeaders() 
      }
    });

    console.log('Upload successful! response:', uploadRes.data.document);
    const docId = uploadRes.data.document.id;

    // 4. Fetch documents
    console.log('4. Fetching documents list...');
    const docsRes = await axios.get(`http://localhost:3001/api/documents?project_id=${projectId}`, config);
    console.log(`Found ${docsRes.data.documents.length} documents.`);
    
    // 5. Download test
    console.log(`5. Testing download for doc ID: ${docId}...`);
    const downloadRes = await axios.get(`http://localhost:3001/api/documents/${docId}/download`, {
        ...config,
        responseType: 'arraybuffer'
    });
    
    if (downloadRes.data.byteLength > 0) {
        console.log('Download test passed. Received bytes:', downloadRes.data.byteLength);
    } else {
        console.error('Download test failed: file is empty');
    }

    // Cleanup
    fs.unlinkSync(testFilePath);
    console.log('--- Verification Complete ---');
    
  } catch (err) {
    console.error('Test failed:', err.response ? err.response.data : err.message);
  }
}

runTests();
