const bcrypt = require('D:/Freelance/ds16-v1/server/node_modules/bcryptjs');

const passwords = {
  Abhijit: 'admin123',
  chaitali: 'chaitali1234',
  rahul: 'rahul2026'
};

Object.entries(passwords).forEach(([user, pass]) => {
  const hash = bcrypt.hashSync(pass, 10);
  console.log(`${user}: ${hash}`);
});
