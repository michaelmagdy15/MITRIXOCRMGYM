import express from 'express';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import * as sqlDb from './dbOperations.js';

// Caches imported from parent context (we can just invalidate via fetch or delete from clientsCache/paymentsCache references if shared,
// but since the server.ts caches are local, we will expose an invalidation function or handle them directly in server.ts.
// Actually, it's easiest if we return the handlers or if we export a function that registers them on app).

export function registerSqlRoutes(app: express.Application, requireAuth: any, getRequestHostname: any, getTenantInfoForHost: any, getDbForRequest: any, clientsCache: Map<string, any>, paymentsCache: Map<string, any>) {
  
  const invalidateCache = (config: any) => {
    const dbId = config?.firestoreDatabaseId || '(default)';
    clientsCache.delete(dbId);
    paymentsCache.delete(dbId);
  };

  // Leads route
  app.get("/api/leads", requireAuth, async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      if (tenantId === 'inzanathletics') {
        const leads = await sqlDb.getLeadsFromSQL();
        return res.json({ leads });
      }
      const db = await getDbForRequest(req);
      const snap = await db.collection('clients')
        .where('status', '==', 'Lead')
        .where('stage', 'in', ['New', 'Trial', 'Follow Up'])
        .get();
      const leads = snap.docs.map((doc: any) => ({ ...doc.data(), id: doc.id }));
      return res.json({ leads });
    } catch (err: any) {
      console.error('[API] Error in GET /api/leads:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Add client
  app.post("/api/clients/add", requireAuth, async (req, res) => {
    try {
      const { id, client } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.addClientToSQL(id, client);
        invalidateCache(config);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('clients').doc(id).set(client);
      invalidateCache(config);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/clients/add:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Update client
  app.post("/api/clients/update", requireAuth, async (req, res) => {
    try {
      const { id, updates } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.updateClientInSQL(id, updates);
        invalidateCache(config);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('clients').doc(id).update(updates);
      invalidateCache(config);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/clients/update:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Delete client
  app.post("/api/clients/delete", requireAuth, async (req, res) => {
    try {
      const { id } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.deleteClientFromSQL(id);
        invalidateCache(config);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('clients').doc(id).delete();
      invalidateCache(config);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/clients/delete:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Delete multiple clients
  app.post("/api/clients/delete-multiple", requireAuth, async (req, res) => {
    try {
      const { ids } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.deleteMultipleClientsFromSQL(ids);
        invalidateCache(config);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      const batch = db.batch();
      ids.forEach((id: string) => {
        batch.delete(db.collection('clients').doc(id));
      });
      await batch.commit();
      invalidateCache(config);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/clients/delete-multiple:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Add comment
  app.post("/api/clients/add-comment", requireAuth, async (req, res) => {
    try {
      const { clientId, comment } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.addCommentToSQL(clientId, comment);
        invalidateCache(config);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      const docRef = db.collection('clients').doc(clientId).collection('comments').doc();
      await docRef.set(comment);
      await db.collection('clients').doc(clientId).update({
        lastContactDate: new Date().toISOString()
      });
      invalidateCache(config);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/clients/add-comment:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Add payment
  app.post("/api/payments/add", requireAuth, async (req, res) => {
    try {
      const { id, payment } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.addPaymentToSQL(id, payment);
        invalidateCache(config);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('payments').doc(id).set(payment);
      invalidateCache(config);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/payments/add:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Update payment
  app.post("/api/payments/update", requireAuth, async (req, res) => {
    try {
      const { id, updates } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.updatePaymentInSQL(id, updates);
        invalidateCache(config);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('payments').doc(id).update(updates);
      invalidateCache(config);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/payments/update:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Delete payment
  app.post("/api/payments/delete", requireAuth, async (req, res) => {
    try {
      const { id } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.deletePaymentFromSQL(id);
        invalidateCache(config);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('payments').doc(id).delete();
      invalidateCache(config);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/payments/delete:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Fetch all attendance
  app.get("/api/attendance", requireAuth, async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        const attendances = await sqlDb.getAttendancesFromSQL();
        return res.json({ attendances });
      }
      const db = await getDbForRequest(req);
      const snap = await db.collection('attendance').orderBy('date', 'desc').get();
      const attendances = snap.docs.map((d: any) => ({ ...d.data(), id: d.id }));
      return res.json({ attendances });
    } catch (err: any) {
      console.error('[API] Error in GET /api/attendance:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Record attendance
  app.post("/api/attendance/record", requireAuth, async (req, res) => {
    try {
      const { attendance } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.recordAttendanceInSQL(attendance);
        invalidateCache(config);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('attendance').add(attendance);
      invalidateCache(config);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/attendance/record:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Coaches endpoints
  app.get("/api/coaches", requireAuth, async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        const coaches = await sqlDb.getCoachesFromSQL();
        return res.json({ coaches });
      }
      const db = await getDbForRequest(req);
      const snap = await db.collection('coaches').get();
      const coaches = snap.docs.map((d: any) => ({ ...d.data(), id: d.id }));
      return res.json({ coaches });
    } catch (err: any) {
      console.error('[API] Error in GET /api/coaches:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/coaches/add", requireAuth, async (req, res) => {
    try {
      const { id, coach } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.addCoachToSQL(id, coach);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('coaches').doc(id).set(coach);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/coaches/add:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/coaches/update", requireAuth, async (req, res) => {
    try {
      const { id, updates } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.updateCoachInSQL(id, updates);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('coaches').doc(id).update(updates);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/coaches/update:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/coaches/delete", requireAuth, async (req, res) => {
    try {
      const { id } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.deleteCoachFromSQL(id);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('coaches').doc(id).delete();
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/coaches/delete:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Packages endpoints
  app.get("/api/packages", async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        const packages = await sqlDb.getPackagesFromSQL();
        return res.json({ packages });
      }
      const db = await getDbForRequest(req);
      const snap = await db.collection('packages').get();
      const packages = snap.docs.map((d: any) => ({ ...d.data(), id: d.id }));
      return res.json({ packages });
    } catch (err: any) {
      console.error('[API] Error in GET /api/packages:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/packages/add", requireAuth, async (req, res) => {
    try {
      const { id, pkg } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.addPackageToSQL(id, pkg);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('packages').doc(id).set(pkg);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/packages/add:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/packages/update", requireAuth, async (req, res) => {
    try {
      const { id, updates } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.updatePackageInSQL(id, updates);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('packages').doc(id).update(updates);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/packages/update:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/packages/delete", requireAuth, async (req, res) => {
    try {
      const { id } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.deletePackageFromSQL(id);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('packages').doc(id).delete();
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/packages/delete:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Sessions endpoints
  app.get("/api/sessions", requireAuth, async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        const sessions = await sqlDb.getSessionsFromSQL();
        return res.json({ sessions });
      }
      const db = await getDbForRequest(req);
      const snap = await db.collection('sessions').get();
      const sessions = snap.docs.map((d: any) => ({ ...d.data(), id: d.id }));
      return res.json({ sessions });
    } catch (err: any) {
      console.error('[API] Error in GET /api/sessions:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/sessions/add", requireAuth, async (req, res) => {
    try {
      const { id, session } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.addSessionToSQL(id, session);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('sessions').doc(id).set(session);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/sessions/add:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/sessions/update", requireAuth, async (req, res) => {
    try {
      const { id, updates } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.updateSessionInSQL(id, updates);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('sessions').doc(id).update(updates);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/sessions/update:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Tasks endpoints
  app.get("/api/tasks", requireAuth, async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        const tasks = await sqlDb.getTasksFromSQL();
        return res.json({ tasks });
      }
      const db = await getDbForRequest(req);
      const snap = await db.collection('tasks').get();
      const tasks = snap.docs.map((d: any) => ({ ...d.data(), id: d.id }));
      return res.json({ tasks });
    } catch (err: any) {
      console.error('[API] Error in GET /api/tasks:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/tasks/add", requireAuth, async (req, res) => {
    try {
      const { id, task } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.addTaskToSQL(id, task);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('tasks').doc(id).set(task);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/tasks/add:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/tasks/update", requireAuth, async (req, res) => {
    try {
      const { id, updates } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.updateTaskInSQL(id, updates);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('tasks').doc(id).update(updates);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/tasks/update:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/tasks/delete", requireAuth, async (req, res) => {
    try {
      const { id } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.deleteTaskFromSQL(id);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('tasks').doc(id).delete();
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/tasks/delete:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Import Batches endpoints
  app.get("/api/import-batches", requireAuth, async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        const importBatches = await sqlDb.getImportBatchesFromSQL();
        return res.json({ importBatches });
      }
      const db = await getDbForRequest(req);
      const snap = await db.collection('importBatches').orderBy('date', 'desc').get();
      const importBatches = snap.docs.map((d: any) => ({ ...d.data(), id: d.id }));
      return res.json({ importBatches });
    } catch (err: any) {
      console.error('[API] Error in GET /api/import-batches:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/import-batches/add", requireAuth, async (req, res) => {
    try {
      const { id, batch } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.addImportBatchToSQL(id, batch);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('importBatches').doc(id).set(batch);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/import-batches/add:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/import-batches/update", requireAuth, async (req, res) => {
    try {
      const { id, updates } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.updateImportBatchInSQL(id, updates);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('importBatches').doc(id).update(updates);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/import-batches/update:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // User Targets endpoints
  app.get("/api/user-targets", requireAuth, async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        const userTargets = await sqlDb.getUserTargetsFromSQL();
        return res.json({ userTargets });
      }
      const db = await getDbForRequest(req);
      const snap = await db.collection('userTargets').get();
      const userTargets = snap.docs.map((d: any) => ({ ...d.data(), id: d.id }));
      return res.json({ userTargets });
    } catch (err: any) {
      console.error('[API] Error in GET /api/user-targets:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/user-targets/save", requireAuth, async (req, res) => {
    try {
      const { id, target } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.saveUserTargetToSQL(id, target);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('userTargets').doc(id).set(target, { merge: true });
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/user-targets/save:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Audit Logs endpoints
  app.get("/api/audit-logs", requireAuth, async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        const auditLogs = await sqlDb.getAuditLogsFromSQL();
        return res.json({ auditLogs });
      }
      const db = await getDbForRequest(req);
      const snap = await db.collection('auditLogs').orderBy('timestamp', 'desc').get();
      const auditLogs = snap.docs.map((d: any) => ({ ...d.data(), id: d.id }));
      return res.json({ auditLogs });
    } catch (err: any) {
      console.error('[API] Error in GET /api/audit-logs:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/audit-logs/add", requireAuth, async (req, res) => {
    try {
      const { log } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.addAuditLogToSQL(log);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('auditLogs').add(log);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/audit-logs/add:', err);
      return res.status(500).json({ error: err.message });
    }
  });
}
