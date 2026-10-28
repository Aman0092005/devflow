import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { requireAuth } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import taskRoutes from './routes/tasks.js';
import noteRoutes from './routes/notes.js';
import dashboardRoutes from './routes/dashboard.js';
import dsaRoutes from './routes/dsa.js';
import memberRoutes from './routes/members.js';
import notificationRoutes from './routes/notifications.js';
import attachmentRoutes from './routes/attachments.js';
import searchRoutes from './routes/search.js';
import analyticsRoutes from './routes/analytics.js';
import { initSocket } from './socket.js';

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set. Copy .env.example to .env.');

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/projects', requireAuth, projectRoutes);
app.use('/api', requireAuth, taskRoutes);
app.use('/api', requireAuth, memberRoutes);
app.use('/api', requireAuth, attachmentRoutes);
app.use('/api/notes', requireAuth, noteRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);
app.use('/api/dsa', requireAuth, dsaRoutes);
app.use('/api/notifications', requireAuth, notificationRoutes);
app.use('/api/search', requireAuth, searchRoutes);
app.use('/api/analytics', requireAuth, analyticsRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Try again.' });
});

const port = process.env.PORT || 4000;
const server = http.createServer(app);
initSocket(server);
server.listen(port, () => console.log(`DevFlow API on http://localhost:${port}`));
