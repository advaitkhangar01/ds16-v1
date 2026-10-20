# DS16 – Design Studio 16 Production App

A production-grade internal management system for Design Studio 16 architecture firm.

## Features
- ✅ Role-based auth (Admin + Employee) with JWT
- ✅ Attendance check-in/out with geolocation + IST timezone
- ✅ Stage-based project management (Construction / Interior / Liaisoning)
- ✅ Threaded comment system with @mention task assignment
- ✅ Admin dashboard: kanban board, attendance summary, today's tasks
- ✅ Employee dashboard: check-in/out, my tasks, my projects
- ✅ Vendor catalog with category grouping

## Quick Start (Local Development)

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### 1. PostgreSQL Setup
```sql
-- In psql or pgAdmin:
CREATE DATABASE ds16;
```

### 2. Backend Setup
```bash
cd server
cp .env.example .env
# Edit .env with your PostgreSQL credentials

npm install
npm run seed       # Creates schema + seeds users + vendors
npm run dev        # Starts on port 3001
```

### 3. Frontend Setup
```bash
cd client
npm install
npm run dev        # Starts on port 5173
```



## Production VPS Deployment

### 1. Install Dependencies (Ubuntu)
```bash
sudo apt update && sudo apt install -y nodejs npm postgresql nginx
sudo npm install -g pm2
```

### 2. PostgreSQL Setup
```bash
sudo -u postgres psql -c "CREATE DATABASE ds16;"
sudo -u postgres psql -c "CREATE USER ds16user WITH PASSWORD 'strongpassword';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ds16 TO ds16user;"
```

### 3. Prepare Server Environment
```bash
mkdir -p /var/www/ds16
# Upload DS16V1 content to /var/www/ds16/
cd /var/www/ds16/server

# Ensure logs directory exists for PM2
mkdir -p logs

# Set up environment
cp .env.production .env
nano .env   # Update DATABASE_URL, JWT_SECRET, and ALLOWED_ORIGINS
```

### 4. Backend Deployment
```bash
cd /var/www/ds16/server
npm install --production
node db/seed.js   # Run once to initialize schema
pm2 start ecosystem.config.js --env production
pm2 save && pm2 startup
```

### 5. Frontend Build
```bash
cd /var/www/ds16/client
npm install
npm run build   # Generates dist/ folder
```

### 6. Nginx Config
```nginx
# /etc/nginx/sites-available/ds16
server {
    listen 80;
    server_name yourdomain.com; # <--- Replace with your domain or IP

    # Frontend static files
    root /var/www/ds16/client/dist;
    index index.html;

    # Frontend SPA handling
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API Proxy
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Static Assets (Optional - Direct serve by Nginx)
    location /uploads {
        alias /var/www/ds16/server/uploads;
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/ds16 /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 7. SSL Setup (Recommended)
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## Production Readiness Checklist
- [x] **Case Sensitivity**: All imports match file system case exactly (Required for Ubuntu).
- [x] **Paths**: Using `path.join` for all server-side paths.
- [x] **Security**: Use `helmet` and proper CORS origins.
- [x] **Logs**: `server/logs` directory ready for PM2.

## API Reference
| POST | /api/auth/login | — | Login, get JWT |
! [NEW] Projects seeding is now included in the main seed script.
|--------|----------|------|-------------|
| POST | /api/auth/login | — | Login, get JWT |
| POST | /api/attendance/checkin | JWT | Check in with location |
| POST | /api/attendance/checkout | JWT | Check out |
| GET | /api/attendance/today | JWT | Today's records |
| GET | /api/attendance/all | Admin | All records (paginated) |
| POST | /api/projects | Admin | Create project |
| GET | /api/projects | JWT | List projects |
| GET | /api/projects/:id | JWT | Project detail |
| PATCH | /api/projects/:id/stages/:sid | Admin | Update stage status |
| POST | /api/comments | JWT | Post comment/assign task |
| GET | /api/comments?project_id=X | JWT | Threaded comments |
| PATCH | /api/comments/:id/status | JWT | Update task status |
| GET | /api/vendors | JWT | Vendor list |
| GET | /api/dashboard/admin | Admin | Admin dashboard data |
| GET | /api/dashboard/employee | JWT | Employee dashboard data |
