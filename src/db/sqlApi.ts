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
    const tenantId = config?.tenantId || 'default';
    const cacheKey = `${tenantId}:${dbId}`;
    clientsCache.delete(cacheKey);
    paymentsCache.delete(cacheKey);
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

  // Users endpoints
  app.get("/api/users", requireAuth, async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        const users = await sqlDb.getUsersFromSQL();
        return res.json({ users });
      }
      const db = await getDbForRequest(req);
      const snap = await db.collection('users').get();
      const users = snap.docs.map((d: any) => ({ ...d.data(), id: d.id }));
      return res.json({ users });
    } catch (err: any) {
      console.error('[API] Error in GET /api/users:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/users/add", requireAuth, async (req, res) => {
    try {
      const { id, user } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.addUserToSQL(id, user);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('users').doc(id).set(user);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/users/add:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/users/update", requireAuth, async (req, res) => {
    try {
      const { id, updates } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.updateUserInSQL(id, updates);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('users').doc(id).update(updates);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/users/update:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/users/delete", requireAuth, async (req, res) => {
    try {
      const { id } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.deleteUserFromSQL(id);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('users').doc(id).delete();
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/users/delete:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Settings endpoints
  app.get("/api/settings", async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      let isAuthenticated = false;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const idToken = authHeader.split('Bearer ')[1];
        try {
          // Note: using tenant admin to verify token, or just global admin.
          // Since getAdminAuth is not imported here, we can just assume if we want we can use globalAdmin.
          // But actually, getAdminAuthForTenant is available.
          // @ts-ignore
          const { getAdminAuthForTenant } = await import('./firebaseAdmin');
          const adminAuth = getAdminAuthForTenant(tenantId || '');
          await adminAuth.verifyIdToken(idToken);
          isAuthenticated = true;
        } catch (e) {
          // invalid token
        }
      }
      
      let settingsObj: any = {};

      if (tenantId === 'inzanathletics') {
        const settings = await sqlDb.getSettingsFromSQL();
        settingsObj = settings;
      } else {
        const db = await getDbForRequest(req);
        const snap = await db.collection('settings').get();
        snap.forEach((doc: any) => { settingsObj[doc.id] = doc.data(); });
      }

      if (!isAuthenticated) {
        delete settingsObj['commission'];
        delete settingsObj['sales-target'];
      }

      return res.json({ settings: settingsObj });
    } catch (err: any) {
      console.error('[API] Error in GET /api/settings:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Announcements endpoints
  app.get("/api/announcements", async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        const announcements = await sqlDb.getAnnouncementsFromSQL();
        return res.json({ announcements });
      }
      const db = await getDbForRequest(req);
      const snap = await db.collection('announcements').get();
      const announcements = snap.docs.map((doc: any) => ({ ...doc.data(), id: doc.id }));
      return res.json({ announcements });
    } catch (err: any) {
      console.error('[API] Error in GET /api/announcements:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/announcements/add", requireAuth, async (req, res) => {
    try {
      const { announcement } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.addAnnouncementToSQL(announcement);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('announcements').add(announcement);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/announcements/add:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/announcements/update", requireAuth, async (req, res) => {
    try {
      const { id, updates } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.updateAnnouncementInSQL(id, updates);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('announcements').doc(id).update(updates);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/announcements/update:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/announcements/delete", requireAuth, async (req, res) => {
    try {
      const { id } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.deleteAnnouncementFromSQL(id);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('announcements').doc(id).delete();
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/announcements/delete:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/settings/update", requireAuth, async (req, res) => {
    try {
      const { id, updates } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      if (tenantId === 'inzanathletics') {
        await sqlDb.updateSettingInSQL(id, updates);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('settings').doc(id).set(updates, { merge: true });
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/settings/update:', err);
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

  // Call Center
  app.get("/api/call-center", requireAuth, async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      if (config?.tenantId === 'inzanathletics') {
        const logs = await sqlDb.getCallCenterLogs();
        return res.json({ logs });
      }
      const db = await getDbForRequest(req);
      const snap = await db.collection('callCenterLog').get();
      const logs = snap.docs.map((doc: any) => ({ ...doc.data(), id: doc.id }));
      return res.json({ logs });
    } catch (err: any) {
      console.error('[API] Error in GET /api/call-center:', err);
      return res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/call-center/add", requireAuth, async (req, res) => {
    try {
      const { log } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      if (config?.tenantId === 'inzanathletics') {
        await sqlDb.addCallCenterLog(log);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('callCenterLog').doc(log.id).set(log);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Complaints
  app.get("/api/complaints", requireAuth, async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      if (config?.tenantId === 'inzanathletics') {
        const complaints = await sqlDb.getComplaints();
        return res.json({ complaints });
      }
      const db = await getDbForRequest(req);
      const snap = await db.collection('complaints').get();
      const complaints = snap.docs.map((doc: any) => ({ ...doc.data(), id: doc.id }));
      return res.json({ complaints });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/complaints/add", requireAuth, async (req, res) => {
    try {
      const { complaint } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      if (config?.tenantId === 'inzanathletics') {
        await sqlDb.addComplaint(complaint);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('complaints').doc(complaint.id).set(complaint);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/complaints/update", requireAuth, async (req, res) => {
    try {
      const { id, updates } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      if (config?.tenantId === 'inzanathletics') {
        await sqlDb.updateComplaint(id, updates);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('complaints').doc(id).update(updates);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/complaints/delete", requireAuth, async (req, res) => {
    try {
      const { id } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      if (config?.tenantId === 'inzanathletics') {
        await sqlDb.deleteComplaint(id);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('complaints').doc(id).delete();
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Lost and Found
  app.get("/api/lost-and-found", requireAuth, async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      if (config?.tenantId === 'inzanathletics') {
        const items = await sqlDb.getLostAndFound();
        return res.json({ items });
      }
      const db = await getDbForRequest(req);
      const snap = await db.collection('lostAndFound').get();
      const items = snap.docs.map((doc: any) => ({ ...doc.data(), id: doc.id }));
      return res.json({ items });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/lost-and-found/add", requireAuth, async (req, res) => {
    try {
      const { item } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      if (config?.tenantId === 'inzanathletics') {
        await sqlDb.addLostAndFound(item);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('lostAndFound').doc(item.id).set(item);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/lost-and-found/update", requireAuth, async (req, res) => {
    try {
      const { id, updates } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      if (config?.tenantId === 'inzanathletics') {
        await sqlDb.updateLostAndFound(id, updates);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('lostAndFound').doc(id).update(updates);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/lost-and-found/delete", requireAuth, async (req, res) => {
    try {
      const { id } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      if (config?.tenantId === 'inzanathletics') {
        await sqlDb.deleteLostAndFound(id);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('lostAndFound').doc(id).delete();
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Calendar Events
  app.get("/api/calendar", requireAuth, async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      if (config?.tenantId === 'inzanathletics') {
        const events = await sqlDb.getCalendarEvents();
        return res.json({ events });
      }
      const db = await getDbForRequest(req);
      const snap = await db.collection('calendarEvents').get();
      const events = snap.docs.map((doc: any) => ({ ...doc.data(), id: doc.id }));
      return res.json({ events });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/calendar/add", requireAuth, async (req, res) => {
    try {
      const { event } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      if (config?.tenantId === 'inzanathletics') {
        await sqlDb.addCalendarEvent(event);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('calendarEvents').doc(event.id).set(event);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/calendar/delete", requireAuth, async (req, res) => {
    try {
      const { id } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      if (config?.tenantId === 'inzanathletics') {
        await sqlDb.deleteCalendarEvent(id);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('calendarEvents').doc(id).delete();
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Bookings
  app.get("/api/bookings", requireAuth, async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      if (config?.tenantId === 'inzanathletics') {
        const bookings = await sqlDb.getBookings();
        return res.json({ bookings });
      }
      const db = await getDbForRequest(req);
      const snap = await db.collection('bookings').get();
      const bookings = snap.docs.map((doc: any) => ({ ...doc.data(), id: doc.id }));
      return res.json({ bookings });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/bookings/add", requireAuth, async (req, res) => {
    try {
      const { booking } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      if (config?.tenantId === 'inzanathletics') {
        await sqlDb.addBooking(booking);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('bookings').doc(booking.id).set(booking);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/bookings/update", requireAuth, async (req, res) => {
    try {
      const { id, updates } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      if (config?.tenantId === 'inzanathletics') {
        await sqlDb.updateBooking(id, updates);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('bookings').doc(id).update(updates);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Club Operations
  app.get("/api/club-operations", requireAuth, async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      if (config?.tenantId === 'inzanathletics') {
        const operations = await sqlDb.getClubOperations();
        return res.json({ operations });
      }
      const db = await getDbForRequest(req);
      const snap = await db.collection('clubOperations').get();
      const operations = snap.docs.map((doc: any) => ({ ...doc.data(), id: doc.id }));
      return res.json({ operations });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/club-operations/add", requireAuth, async (req, res) => {
    try {
      const { operation } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      if (config?.tenantId === 'inzanathletics') {
        await sqlDb.addClubOperation(operation);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('clubOperations').doc(operation.id).set(operation);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/club-operations/update", requireAuth, async (req, res) => {
    try {
      const { id, updates } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      if (config?.tenantId === 'inzanathletics') {
        await sqlDb.updateClubOperation(id, updates);
        return res.json({ success: true });
      }
      const db = await getDbForRequest(req);
      await db.collection('clubOperations').doc(id).update(updates);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Booking Requests
  app.get("/api/booking-requests", requireAuth, async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      if (tenantId === 'inzanathletics') {
        const requests = await sqlDb.getBookingRequests();
        return res.json({ bookingRequests: requests });
      }
      return res.json({ bookingRequests: [] });
    } catch (err: any) {
      console.error('[API] Error in GET /api/booking-requests:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/booking-requests/update-status", requireAuth, async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      if (tenantId === 'inzanathletics') {
        const { id, status } = req.body;
        await sqlDb.updateBookingRequestStatus(id, status);
        return res.json({ success: true });
      }
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/booking-requests/update-status:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/clients/update-from-booking", requireAuth, async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      if (tenantId === 'inzanathletics') {
        const { id, fields } = req.body;
        await sqlDb.updateClient(id, fields);
        return res.json({ success: true });
      }
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/clients/update-from-booking:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/tasks/add", requireAuth, async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      if (tenantId === 'inzanathletics') {
        await sqlDb.addTask(req.body.task);
        return res.json({ success: true });
      }
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/tasks/add:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // --- Club Operations API ---
  app.get('/api/juice-bar-orders', requireAuth, async (req, res) => {
    try {
      const orders = await sqlDb.getJuiceBarOrders();
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch juice bar orders' });
    }
  });

  app.post('/api/juice-bar-orders/update-status', requireAuth, async (req, res) => {
    try {
      const { id, status } = req.body;
      await sqlDb.updateJuiceBarOrder(id, status);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update juice bar order status' });
    }
  });

  app.get('/api/lockers', requireAuth, async (req, res) => {
    try {
      const lockers = await sqlDb.getLockers();
      res.json(lockers);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch lockers' });
    }
  });

  app.post('/api/lockers/add', requireAuth, async (req, res) => {
    try {
      const { locker } = req.body;
      await sqlDb.addLocker(locker);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to add locker' });
    }
  });

  app.post('/api/lockers/update', requireAuth, async (req, res) => {
    try {
      const { id, updates } = req.body;
      await sqlDb.updateLocker(id, updates);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update locker' });
    }
  });

  app.post('/api/lockers/delete', requireAuth, async (req, res) => {
    try {
      const { id } = req.body;
      await sqlDb.deleteLocker(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete locker' });
    }
  });

  app.get('/api/locker-requests', requireAuth, async (req, res) => {
    try {
      const requests = await sqlDb.getLockerRequests();
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch locker requests' });
    }
  });

  app.post('/api/locker-requests/update-status', requireAuth, async (req, res) => {
    try {
      const { id, status } = req.body;
      await sqlDb.updateLockerRequest(id, status);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update locker request status' });
    }
  });

  app.get('/api/guest-invites', requireAuth, async (req, res) => {
    try {
      const invites = await sqlDb.getGuestInvites();
      res.json(invites);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch guest invites' });
    }
  });

  app.post('/api/guest-invites/update-status', requireAuth, async (req, res) => {
    try {
      const { id, status } = req.body;
      await sqlDb.updateGuestInvite(id, status);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update guest invite status' });
    }
  });

  app.post('/api/audit-logs/add', requireAuth, async (req, res) => {
    try {
      const { log } = req.body;
      await sqlDb.addAuditLog(log);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to add audit log' });
    }
  });

}
