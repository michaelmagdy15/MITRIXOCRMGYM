import express from 'express';

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
      
      const db = await getDbForRequest(req);

      // Role check: staff may update any client; non-staff (members) may only
      // update their own client document with safe fields.
      const uid = (req as any).user?.uid;
      const userSnap = await db.collection('users').doc(uid || '').get();
      const userRole = userSnap.exists ? userSnap.data()?.role : null;
      const STAFF_ROLES = ['admin', 'super_admin', 'crm_admin', 'sales_manager', 'manager', 'rep', 'sales_rep', 'sales', 'coach'];
      const isStaff = userSnap.exists && STAFF_ROLES.includes(userRole);
      if (!isStaff) {
        const userData = userSnap.data() || {};
        const ownClientIds: string[] = [];
        if (userData.clientDocId) ownClientIds.push(userData.clientDocId);
        const linked = userData.clientDocId
          ? (await db.collection('clients').doc(userData.clientDocId).get().catch(() => null))?.data()?.linkedClientIds
          : [];
        if (Array.isArray(linked)) linked.forEach((cid: string) => ownClientIds.push(cid));
        if (!ownClientIds.includes(id)) {
          return res.status(403).json({ error: 'You can only update your own profile.' });
        }
        const SAFE_MEMBER_KEYS = ['name', 'phone', 'photoURL', 'portalUserId'];
        const unsafeKeys = Object.keys(updates || {}).filter(k => !SAFE_MEMBER_KEYS.includes(k));
        if (unsafeKeys.length > 0) {
          return res.status(403).json({ error: `Members may not update fields: ${unsafeKeys.join(', ')}` });
        }
      }

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
          const { default: admin } = await import('firebase-admin');
          await admin.auth().verifyIdToken(idToken!);
          isAuthenticated = true;
        } catch (e) {
          // invalid token
        }
      }
      
      const db = await getDbForRequest(req);

      const [brandingSnap, featuresSnap, storefrontSnap, branchesSnap, commissionSnap, salesTargetSnap] = await Promise.all([
        db.collection('settings').doc('branding').get(),
        db.collection('settings').doc('features').get(),
        db.collection('settings').doc('storefront').get(),
        db.collection('settings').doc('branches').get(),
        db.collection('settings').doc('commission').get(),
        db.collection('settings').doc('sales-target').get(),
      ]);

      const settingsObj: any = {};
      if (brandingSnap.exists) settingsObj.branding = brandingSnap.data();
      if (featuresSnap.exists) settingsObj.features = featuresSnap.data();
      if (storefrontSnap.exists) settingsObj.storefront = storefrontSnap.data();
      if (branchesSnap.exists) settingsObj.branches = branchesSnap.data();
      if (commissionSnap.exists) settingsObj.commission = commissionSnap.data();
      if (salesTargetSnap.exists) settingsObj['sales-target'] = salesTargetSnap.data();

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
      
      const db = await getDbForRequest(req);
      await db.collection('settings').doc(id).set(updates, { merge: true });
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/settings/update:', err);
      return res.status(500).json({ error: err.message });
    }
  });



  // User Targets endpoints
  const userTargetsGetHandler = async (req: express.Request, res: express.Response) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      let userTargets;
      // Return under both keys so any client hook (userTargets or targets) parses it correctly.
      return res.json({ userTargets, targets: userTargets });
    } catch (err: any) {
      console.error('[API] Error in GET /api/user-targets:', err);
      return res.status(500).json({ error: err.message });
    }
  };

  const userTargetsSaveHandler = async (req: express.Request, res: express.Response) => {
    try {
      const { id, target } = req.body;
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      const db = await getDbForRequest(req);
      await db.collection('userTargets').doc(id).set(target, { merge: true });
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/user-targets/save:', err);
      return res.status(500).json({ error: err.message });
    }
  };

  app.get("/api/user-targets", requireAuth, userTargetsGetHandler);
  app.post("/api/user-targets/save", requireAuth, userTargetsSaveHandler);
  // Alias so client hooks posting to /api/user-targets/update also succeed.
  app.post("/api/user-targets/update", requireAuth, userTargetsSaveHandler);

  // Audit Logs endpoints
  app.get("/api/audit-logs", requireAuth, async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      
      const db = await getDbForRequest(req);
      const { fromISO, toISO, limit, entityId } = req.query;
      const parsedLimit = Math.max(1, Math.min(parseInt(String(limit ?? '1000'), 10) || 1000, 5000));
      let auditQuery: any = db.collection('auditLogs').orderBy('timestamp', 'desc');
      if (entityId) auditQuery = auditQuery.where('entityId', '==', entityId);
      if (fromISO) auditQuery = auditQuery.where('timestamp', '>=', fromISO);
      if (toISO) auditQuery = auditQuery.where('timestamp', '<=', toISO);
      const snap = await auditQuery.limit(parsedLimit).get();
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
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Error in POST /api/tasks/add:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // --- Club Operations API ---
  app.get('/api/juice-bar-orders', requireAuth, async (req, res) => {
    try {
      const db = await getDbForRequest(req);
      const snap = await db.collection('juiceBarOrders').get();
      const orders = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      res.json(orders);
    } catch (error) {
      console.error('[API] Error fetching juice bar orders:', error);
      res.status(500).json({ error: 'Failed to fetch juice bar orders' });
    }
  });

  app.post('/api/juice-bar-orders/update-status', requireAuth, async (req, res) => {
    try {
      const { id, status } = req.body;
      const db = await getDbForRequest(req);
      await db.collection('juiceBarOrders').doc(id).update({ status });
      res.json({ success: true });
    } catch (error) {
      console.error('[API] Error updating juice bar order:', error);
      res.status(500).json({ error: 'Failed to update juice bar order status' });
    }
  });

  app.get('/api/lockers', requireAuth, async (req, res) => {
    try {
      const db = await getDbForRequest(req);
      const snap = await db.collection('lockers').get();
      const lockers = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      res.json(lockers);
    } catch (error) {
      console.error('[API] Error fetching lockers:', error);
      res.status(500).json({ error: 'Failed to fetch lockers' });
    }
  });

  app.post('/api/lockers/add', requireAuth, async (req, res) => {
    try {
      const { locker } = req.body;
      const db = await getDbForRequest(req);
      await db.collection('lockers').add(locker);
      res.json({ success: true });
    } catch (error) {
      console.error('[API] Error adding locker:', error);
      res.status(500).json({ error: 'Failed to add locker' });
    }
  });

  app.post('/api/lockers/update', requireAuth, async (req, res) => {
    try {
      const { id, updates } = req.body;
      const db = await getDbForRequest(req);
      await db.collection('lockers').doc(id).update(updates);
      res.json({ success: true });
    } catch (error) {
      console.error('[API] Error updating locker:', error);
      res.status(500).json({ error: 'Failed to update locker' });
    }
  });

  app.post('/api/lockers/delete', requireAuth, async (req, res) => {
    try {
      const { id } = req.body;
      const db = await getDbForRequest(req);
      await db.collection('lockers').doc(id).delete();
      res.json({ success: true });
    } catch (error) {
      console.error('[API] Error deleting locker:', error);
      res.status(500).json({ error: 'Failed to delete locker' });
    }
  });

  app.get('/api/locker-requests', requireAuth, async (req, res) => {
    try {
      const db = await getDbForRequest(req);
      const snap = await db.collection('lockerRequests').get();
      const requests = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      res.json(requests);
    } catch (error) {
      console.error('[API] Error fetching locker requests:', error);
      res.status(500).json({ error: 'Failed to fetch locker requests' });
    }
  });

  app.post('/api/locker-requests/update-status', requireAuth, async (req, res) => {
    try {
      const { id, status } = req.body;
      const db = await getDbForRequest(req);
      await db.collection('lockerRequests').doc(id).update({ status });
      res.json({ success: true });
    } catch (error) {
      console.error('[API] Error updating locker request:', error);
      res.status(500).json({ error: 'Failed to update locker request status' });
    }
  });

  app.get('/api/guest-invites', requireAuth, async (req, res) => {
    try {
      const db = await getDbForRequest(req);
      const snap = await db.collection('guestInvites').get();
      const invites = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      res.json(invites);
    } catch (error) {
      console.error('[API] Error fetching guest invites:', error);
      res.status(500).json({ error: 'Failed to fetch guest invites' });
    }
  });

  app.post('/api/guest-invites/update-status', requireAuth, async (req, res) => {
    try {
      const { id, status } = req.body;
      const db = await getDbForRequest(req);
      await db.collection('guestInvites').doc(id).update({ status });
      res.json({ success: true });
    } catch (error) {
      console.error('[API] Error updating guest invite:', error);
      res.status(500).json({ error: 'Failed to update guest invite status' });
    }
  });

  app.post('/api/audit-logs/add', requireAuth, async (req, res) => {
    try {
      const { log } = req.body;
      const db = await getDbForRequest(req);
      await db.collection('auditLogs').add({
        ...log,
        timestamp: log.timestamp || new Date().toISOString()
      });
      res.json({ success: true });
    } catch (error) {
      console.error('[API] Error adding audit log:', error);
      res.status(500).json({ error: 'Failed to add audit log' });
    }
  });

  // =============================================================
  // MEMBER-FACING PUBLIC ENDPOINTS
  // =============================================================
  // These endpoints are intentionally PUBLIC (no requireAuth): they serve
  // pre-auth login, password reset, and self check-in flows. They use the
  // tenant-scoped getDbForRequest(req) and never expose other tenants' data.
  // They also implement server-authoritative session math so members can no
  // longer write packages/sessionsRemaining directly through Firestore rules.

  // Resolve the Firebase auth email for a member ID (legacy accounts whose
  // email is not the deterministic member-{id}@... scheme).
  app.post('/api/member/resolve-email', async (req, res) => {
    try {
      const memberId = String(req.body?.memberId || '').trim();
      if (!memberId) return res.status(400).json({ error: 'memberId is required' });
      const db = await getDbForRequest(req);
      const snap = await db.collection('users')
        .where('clientRecordId', '==', memberId)
        .limit(1)
        .get();
      if (snap.empty) return res.status(404).json({ error: 'Member ID not found' });
      const email = snap.docs[0]?.data()?.email;
      if (!email) return res.status(404).json({ error: 'No account associated with this Member ID' });
      return res.json({ email });
    } catch (error: any) {
      console.error('[API] Error in POST /api/member/resolve-email:', error);
      return res.status(500).json({ error: 'Failed to resolve member email' });
    }
  });

  // Resolve the Firebase auth email for a coach, by coachId or name.
  app.post('/api/coach/resolve-email', async (req, res) => {
    try {
      const term = String(req.body?.term || '').trim();
      if (!term) return res.status(400).json({ error: 'term is required' });
      const db = await getDbForRequest(req);

      // 1. Try direct Coach ID lookup
      let snap = await db.collection('users')
        .where('coachId', '==', term.toUpperCase())
        .limit(1)
        .get();

      // 2. If not found, try name lookup in users with role='coach'
      if (snap.empty) {
        snap = await db.collection('users')
          .where('role', '==', 'coach')
          .where('name', '==', term)
          .limit(1)
          .get();
      }

      // 3. Fallback: case-insensitive name match on all users of role coach
      let matched = snap.docs[0];
      if (!matched) {
        const allCoaches = await db.collection('users').where('role', '==', 'coach').get();
        matched = allCoaches.docs.find((d: any) => String(d.data()?.name || '').toLowerCase() === term.toLowerCase());
      }

      if (!matched) return res.status(404).json({ error: 'Coach ID or Name not found' });
      const email = matched.data()?.email;
      if (!email) return res.status(404).json({ error: 'No email associated with this Coach account' });
      return res.json({ email });
    } catch (error: any) {
      console.error('[API] Error in POST /api/coach/resolve-email:', error);
      return res.status(500).json({ error: 'Failed to resolve coach email' });
    }
  });

  // Server-side member password reset request (verifies member ID + phone,
  // rate-limits duplicate pending requests, creates the request doc).
  app.post('/api/member/request-password-reset', async (req, res) => {
    try {
      const memberId = String(req.body?.memberId || '').trim();
      const phone = String(req.body?.phone || '').trim();
      if (!memberId || !phone) return res.status(400).json({ error: 'memberId and phone are required' });
      const db = await getDbForRequest(req);

      const userSnap = await db.collection('users')
        .where('clientRecordId', '==', memberId)
        .limit(1)
        .get();
      if (userSnap.empty) {
        return res.status(404).json({ error: 'Member ID not found. Please check your ID and try again.' });
      }
      const userData = userSnap.docs[0]?.data() || {};
      const email: string = userData.email || '';
      const memberName: string = userData.name || '';

      // Verify phone against the clients collection
      const clientSnap = await db.collection('clients').where('memberId', '==', memberId).limit(1).get();
      if (!clientSnap.empty) {
        const clientPhone: string = String(clientSnap.docs[0]?.data()?.phone || '').replace(/\s/g, '');
        const inputPhone = phone.replace(/\s/g, '');
        if (clientPhone && inputPhone && clientPhone !== inputPhone) {
          return res.status(400).json({ error: 'Phone number does not match our records for this Member ID.' });
        }
      }

      // Check for an existing pending request
      const existingSnap = await db.collection('passwordResetRequests')
        .where('email', '==', email)
        .where('status', '==', 'pending')
        .limit(1)
        .get();
      if (!existingSnap.empty) {
        return res.status(400).json({ error: 'A password reset request for this account is already pending admin approval.' });
      }

      await db.collection('passwordResetRequests').add({
        email,
        name: memberName,
        memberId,
        phone,
        requestedAt: new Date().toISOString(),
        status: 'pending',
      });
      return res.json({ success: true });
    } catch (error: any) {
      console.error('[API] Error in POST /api/member/request-password-reset:', error);
      return res.status(500).json({ error: 'Failed to submit password reset request' });
    }
  });

  // Public coach list for the member portal (id/name/branch only — no emails).
  app.get('/api/member/coaches', async (req, res) => {
    try {
      const db = await getDbForRequest(req);
      const snap = await db.collection('users').where('role', '==', 'coach').get();
      const coaches = snap.docs.map((d: any) => {
        const data = d.data() || {};
        return {
          id: d.id,
          name: data.name || '',
          branch: data.branch || undefined,
        };
      });
      return res.json(coaches);
    } catch (error: any) {
      console.error('[API] Error in GET /api/member/coaches:', error);
      return res.status(500).json({ error: 'Failed to fetch coaches' });
    }
  });

  // Server-authoritative self check-in (kiosk / member check-in page).
  // Public by design: validated by the tenant's daily PIN, no auth required.
  app.post('/api/attendance/self-checkin', async (req, res) => {
    try {
      const identifier = String(req.body?.identifier || '').trim();
      const pin = String(req.body?.pin || '').trim();
      const branch = String(req.body?.branch || '');
      if (!identifier || !branch) {
        return res.status(400).json({ error: 'identifier and branch are required' });
      }
      const db = await getDbForRequest(req);

      // Validate PIN against tenant branding settings
      const brandingSnap = await db.collection('settings').doc('branding').get();
      const dailyCheckinPin = brandingSnap.exists() ? brandingSnap.data()?.dailyCheckinPin : undefined;
      if (dailyCheckinPin && pin !== dailyCheckinPin) {
        return res.json({ success: false, message: "Incorrect PIN. Please ask staff for today's PIN." });
      }

      // Search by memberId, then fall back to phone number
      let snap = await db.collection('clients').where('memberId', '==', identifier).get();
      if (snap.empty) {
        snap = await db.collection('clients').where('phone', '==', identifier).get();
      }
      if (snap.empty) {
        return res.json({ success: false, message: 'Member not found. Please check your ID or phone number.' });
      }

      const cairoDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
      let clientDoc: any = null;
      let client: any = null;
      let checkinCount = 0;
      let totalExpectedSessions = 1;
      const alreadyCheckedInTodayList: string[] = [];

      for (const doc of snap.docs) {
        const cData = doc.data() || {};

        if (cData.status === 'Expired') continue;

        const attendanceSnap = await db.collection('attendance').where('clientId', '==', doc.id).get();
        const todayCheckins = attendanceSnap.docs.filter((s: any) => {
          const d = s.data();
          if (!d?.date) return false;
          try {
            return new Date(d.date).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }) === cairoDateStr;
          } catch {
            return false;
          }
        });
        const currentCheckinCount = todayCheckins.length;

        const sessionsSnap = await db.collection('sessions')
          .where('clientId', '==', doc.id)
          .where('date', '==', cairoDateStr)
          .get();
        const ptSessionsCount = sessionsSnap.docs.filter((s: any) => {
          const status = s.data()?.status;
          return status === 'Scheduled' || status === 'Attended';
        }).length;

        const classesSnap = await db.collection('classes').where('date', '==', cairoDateStr).get();
        const groupClassesCount = classesSnap.docs.filter((s: any) => {
          const attendees = s.data()?.attendees || [];
          return attendees.includes(doc.id);
        }).length;

        const expected = Math.max(1, ptSessionsCount + groupClassesCount);

        if (currentCheckinCount < expected) {
          clientDoc = doc;
          client = cData;
          checkinCount = currentCheckinCount;
          totalExpectedSessions = expected;
          break;
        } else {
          alreadyCheckedInTodayList.push(cData.name || '');
        }
      }

      if (!clientDoc || !client) {
        const firstActive = snap.docs.find((d: any) => (d.data() || {}).status !== 'Expired');
        if (firstActive) {
          return res.json({ success: false, message: `Double check-in blocked. All active members linked to this ID/phone (${alreadyCheckedInTodayList.join(', ')}) have already checked in today.` });
        }
        const firstDoc = snap.docs[0];
        if (firstDoc && (firstDoc.data() || {}).status === 'Expired') {
          return res.json({ success: false, message: 'Membership is expired. You must head to the STRIKE branch to renew.' });
        }
        return res.json({ success: false, message: 'Member not found.' });
      }

      if (typeof client.sessionsRemaining === 'number' && client.sessionsRemaining <= 0) {
        return res.json({ success: false, message: `No sessions remaining for ${client.name}. Please renew your membership with staff.` });
      }

      const recordedBy = 'self-checkin';
      await db.collection('attendance').add({
        clientId: clientDoc.id,
        branch,
        date: new Date().toISOString(),
        recordedBy,
        packageName: client.packageType || '',
      });

      const packagesCopy = Array.isArray(client.packages) ? client.packages.map((p: any) => ({ ...p })) : [];
      const activePkgIdx = packagesCopy.findIndex((p: any) => p.status === 'Active');
      const updateData: Record<string, unknown> = {};

      if (activePkgIdx !== -1) {
        const activePkg = packagesCopy[activePkgIdx];
        if (activePkg && typeof activePkg.sessionsRemaining === 'number' && activePkg.sessionsRemaining > 0) {
          packagesCopy[activePkgIdx] = {
            ...activePkg,
            sessionsRemaining: activePkg.sessionsRemaining - 1,
          };
          updateData.packages = packagesCopy;
        }
      }

      if (typeof client.sessionsRemaining === 'number' && client.sessionsRemaining > 0) {
        updateData.sessionsRemaining = client.sessionsRemaining - 1;
      }

      if (Object.keys(updateData).length > 0) {
        await db.collection('clients').doc(clientDoc.id).update(updateData);
      }

      return res.json({ success: true, message: `Welcome, ${client.name}! Attendance recorded.` });
    } catch (error: any) {
      console.error('[API] Error in POST /api/attendance/self-checkin:', error);
      return res.status(500).json({ success: false, message: 'Failed to record attendance. Please ask staff for help.' });
    }
  });

  // =============================================================
  // MEMBER-FACING AUTHENTICATED ENDPOINTS (requireAuth)
  // Server-authoritative class booking and PT session math.
  // =============================================================

  // Resolve the authenticated member's own client document(s) (own + linked).
  async function getMemberClients(req: any) {
    const db = await getDbForRequest(req);
    const uid = (req as any).user?.uid;
    if (!uid) return { db: null, clients: [] as string[] };
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) return { db, clients: [] };
    const userData = userSnap.data() || {};
    const clientIds: string[] = [];
    if (userData.clientDocId) clientIds.push(userData.clientDocId);
    const clientDocId = userData.clientDocId;
    if (clientDocId) {
      try {
        const clientSnap = await db.collection('clients').doc(clientDocId).get();
        const linked = clientSnap.data()?.linkedClientIds || [];
        if (Array.isArray(linked)) linked.forEach((id: string) => clientIds.push(id));
      } catch { /* linked list optional */ }
    }
    return { db, clients: clientIds };
  }

  // Group class package matching logic (mirrors MemberClasses isPackageMatchingClass)
  function isPackageMatchingClass(packageName: string, className: string): boolean {
    const pName = packageName.toLowerCase();
    const cName = className.toLowerCase();
    const isPT = pName.includes('pt') || pName.includes('personal');
    if (isPT) return false;
    const classIsJunior = cName.includes('junior');
    const classIsKids = cName.includes('kid');
    const classIsAdvanced = cName.includes('advanced') || cName.includes('pro');
    const pkgHasJunior = pName.includes('junior');
    const pkgHasKids = pName.includes('kid');
    const pkgHasAdvanced = pName.includes('advanced') || pName.includes('pro');
    if (classIsJunior) {
      if (classIsAdvanced) return pkgHasJunior && pkgHasAdvanced;
      return pkgHasJunior && !pkgHasAdvanced;
    }
    if (classIsKids) {
      if (classIsAdvanced) return pkgHasKids && pkgHasAdvanced;
      return pkgHasKids && !pkgHasAdvanced;
    }
    return !classIsJunior && !classIsKids && !pkgHasJunior && !pkgHasKids;
  }

  app.post('/api/classes/book', requireAuth, async (req, res) => {
    try {
      const { classId, action, clientId } = req.body;
      if (!classId || !['join', 'leave'].includes(action)) {
        return res.status(400).json({ error: 'classId and action (join|leave) are required' });
      }
      const { db, clients } = await getMemberClients(req);
      if (!db || clients.length === 0) {
        return res.status(403).json({ error: 'No member profile linked to this account' });
      }
      if (!clientId || !clients.includes(clientId)) {
        return res.status(403).json({ error: 'You can only manage bookings for your own profile.' });
      }

      const classDoc = await db.collection('classes').doc(classId).get();
      if (!classDoc.exists) return res.status(404).json({ error: 'Class not found.' });
      const gymClass = classDoc.data() || {};

      const clientDoc = await db.collection('clients').doc(clientId).get();
      if (!clientDoc.exists) return res.status(404).json({ error: 'Member profile not found.' });
      const client = clientDoc.data() || {};

      if (client.status === 'Expired') {
        return res.status(400).json({ error: 'Your membership is expired. You must head to the STRIKE branch to renew before booking classes.' });
      }

      let updatedAttendees = Array.isArray(gymClass.attendees) ? [...gymClass.attendees] : [];
      let updatedPackages = Array.isArray(client.packages) ? client.packages.map((p: any) => ({ ...p })) : [];
      let updatedSessionsRemaining = client.sessionsRemaining;
      const isBooked = updatedAttendees.includes(clientId);

      const timeStr = String(gymClass.time || '').split(' - ')[0];
      const classStartTime = timeStr ? new Date(`${gymClass.date}T${timeStr}`).getTime() : 0;

      if (action === 'leave') {
        if (!isBooked) return res.status(400).json({ error: 'You are not booked into this class.' });
        if (classStartTime && classStartTime - Date.now() < 3600000) {
          return res.status(400).json({ error: 'Bookings cannot be cancelled less than 1 hour before the class starts.' });
        }
        updatedAttendees = updatedAttendees.filter((id: string) => id !== clientId);
        const pkgToRefund = updatedPackages.find((p: any) => {
          if (p.status !== 'Active') return false;
          const nameUpper = String(p.packageName || '').toUpperCase();
          const isGroup = nameUpper.includes('GT') || nameUpper.includes('GP') || nameUpper.includes('GROUP');
          if (!isGroup) return false;
          return isPackageMatchingClass(p.packageName, gymClass.name || '');
        });
        if (pkgToRefund && pkgToRefund.sessionsRemaining !== 'unlimited') {
          pkgToRefund.sessionsRemaining = (Number(pkgToRefund.sessionsRemaining) || 0) + 1;
        }
        if (client.sessionsRemaining !== 'unlimited') {
          updatedSessionsRemaining = Math.max(0, (Number(client.sessionsRemaining) || 0) + 1);
        }
      } else {
        if (isBooked) return res.status(400).json({ error: 'You are already booked into this class.' });
        if (updatedAttendees.length >= (gymClass.capacity || 0)) {
          return res.status(400).json({ error: 'This class is fully booked!' });
        }
        const validPkgIndex = updatedPackages.findIndex((p: any) => {
          if (p.status !== 'Active') return false;
          const nameUpper = String(p.packageName || '').toUpperCase();
          const isGroup = nameUpper.includes('GT') || nameUpper.includes('GP') || nameUpper.includes('GROUP');
          if (!isGroup) return false;
          if (!isPackageMatchingClass(p.packageName, gymClass.name || '')) return false;
          const remaining = p.sessionsRemaining;
          return remaining === 'unlimited' || (typeof remaining === 'number' && remaining > 0);
        });
        if (validPkgIndex === -1) {
          const cName = String(gymClass.name || '').toLowerCase();
          let displayCategory = 'Adults';
          if (cName.includes('junior')) {
            displayCategory = cName.includes('advanced') || cName.includes('pro') ? 'Juniors Advanced' : 'Juniors';
          } else if (cName.includes('kid')) {
            displayCategory = cName.includes('pro') ? 'Kids Pro' : 'Kids';
          }
          return res.status(400).json({ error: `You do not have any active Group Training (GT) packages matching this class category (${displayCategory}) with sessions remaining. Please buy a package first.` });
        }
        const validPkg = updatedPackages[validPkgIndex];
        if (validPkg && validPkg.sessionsRemaining !== 'unlimited') {
          validPkg.sessionsRemaining = (Number(validPkg.sessionsRemaining) || 0) - 1;
        }
        if (client.sessionsRemaining !== 'unlimited') {
          updatedSessionsRemaining = Math.max(0, (Number(client.sessionsRemaining) || 0) - 1);
        }
        updatedAttendees.push(clientId);
      }

      const batch = db.batch();
      batch.update(db.collection('classes').doc(classId), { attendees: updatedAttendees });
      batch.update(db.collection('clients').doc(clientId), {
        packages: updatedPackages,
        sessionsRemaining: updatedSessionsRemaining,
      });
      await batch.commit();
      return res.json({ success: true });
    } catch (error: any) {
      console.error('[API] Error in POST /api/classes/book:', error);
      return res.status(500).json({ error: 'Failed to update booking. Please try again.' });
    }
  });

  app.post('/api/sessions/book', requireAuth, async (req, res) => {
    try {
      const { coachId, dateISO, message, clientId } = req.body;
      if (!coachId || !dateISO) {
        return res.status(400).json({ error: 'coachId and dateISO are required' });
      }
      const { db, clients } = await getMemberClients(req);
      if (!db || clients.length === 0) {
        return res.status(403).json({ error: 'No member profile linked to this account' });
      }
      if (!clientId || !clients.includes(clientId)) {
        return res.status(403).json({ error: 'You can only manage bookings for your own profile.' });
      }

      const selectedDateTime = new Date(dateISO);
      if (isNaN(selectedDateTime.getTime())) return res.status(400).json({ error: 'Invalid date.' });
      if (selectedDateTime <= new Date()) {
        return res.status(400).json({ error: 'Please select a future date and time.' });
      }

      const clientDoc = await db.collection('clients').doc(clientId).get();
      if (!clientDoc.exists) return res.status(404).json({ error: 'Member profile not found.' });
      const client = clientDoc.data() || {};
      if (client.status === 'Expired') {
        return res.status(400).json({ error: 'Your membership is expired. You must head to the STRIKE branch to renew before booking sessions.' });
      }

      const coachDoc = await db.collection('users').doc(coachId).get();
      const coach = coachDoc.exists ? coachDoc.data() : null;

      // Check coach schedule if present
      const scheduleSnap = await db.collection('coachSchedules').doc(coachId).get();
      if (scheduleSnap.exists && scheduleSnap.data()?.days) {
        const days = scheduleSnap.data().days;
        const dayOfWeek = selectedDateTime.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
        const dayConfig = days?.[dayOfWeek];
        if (!dayConfig || !dayConfig.enabled) {
          return res.status(400).json({ error: `The coach is not available on ${selectedDateTime.toLocaleDateString('en-US', { weekday: 'long' })}s.` });
        }
        const bookingMinutes = selectedDateTime.getHours() * 60 + selectedDateTime.getMinutes();
        const [startHours, startMinutes] = String(dayConfig.startTime || '').split(':').map(Number);
        const [endHours, endMinutes] = String(dayConfig.endTime || '').split(':').map(Number);
        const startTotal = (startHours || 0) * 60 + (startMinutes || 0);
        const endTotal = (endHours || 0) * 60 + (endMinutes || 0);
        if (bookingMinutes < startTotal || bookingMinutes > endTotal) {
          return res.status(400).json({ error: `The coach is only available between ${dayConfig.startTime} and ${dayConfig.endTime} on ${selectedDateTime.toLocaleDateString('en-US', { weekday: 'long' })}s.` });
        }
      }

      // Conflict check: coach booked within 60 minutes
      const coachSessionsSnap = await db.collection('sessions')
        .where('trainerId', '==', coachId)
        .where('status', '==', 'Scheduled')
        .get();
      const requestedTime = selectedDateTime.getTime();
      const isBooked = coachSessionsSnap.docs.some((d: any) => {
        const existingTime = new Date(d.data()?.date).getTime();
        const differenceMinutes = Math.abs(requestedTime - existingTime) / (1000 * 60);
        return differenceMinutes < 60;
      });
      if (isBooked) {
        return res.status(400).json({ error: 'This coach is already booked within this hour. Please choose another time.' });
      }

      // Find active PT package
      const updatedPackages = Array.isArray(client.packages) ? client.packages.map((p: any) => ({ ...p })) : [];
      let updatedSessionsRemaining = client.sessionsRemaining;
      const validPkgIndex = updatedPackages.findIndex((pkg: any) => {
        if (pkg.status !== 'Active') return false;
        const nameUpper = String(pkg.packageName || '').toUpperCase();
        const isPT = nameUpper.includes('PT') || nameUpper.includes('PERSONAL');
        if (!isPT) return false;
        const remaining = pkg.sessionsRemaining;
        return remaining === 'unlimited' || (typeof remaining === 'number' && remaining > 0);
      });
      if (validPkgIndex === -1) {
        return res.status(400).json({ error: 'You do not have any active Personal Training (PT) packages with sessions remaining. Please buy a package first.' });
      }
      const validPkg = updatedPackages[validPkgIndex];
      if (validPkg && validPkg.sessionsRemaining !== 'unlimited') {
        validPkg.sessionsRemaining = (Number(validPkg.sessionsRemaining) || 0) - 1;
      }
      if (client.sessionsRemaining !== 'unlimited') {
        updatedSessionsRemaining = Math.max(0, (Number(client.sessionsRemaining) || 0) - 1);
      }

      const batch = db.batch();
      const newSessionRef = db.collection('sessions').doc();
      batch.set(newSessionRef, {
        clientId,
        date: selectedDateTime.toISOString(),
        status: 'Scheduled',
        notes: String(message || '').trim() || 'Booked via Member Portal',
        trainerId: coachId,
        branch: coach?.branch || client.branch || 'ALL',
      });

      const formattedDate = selectedDateTime.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const formattedTime = selectedDateTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric' });
      const newTaskRef = db.collection('tasks').doc();
      batch.set(newTaskRef, {
        title: `PT Booking: ${client.name}`,
        description: `Member booked a PT session with ${coach?.name || 'Coach'} on ${formattedDate} at ${formattedTime}.${message ? ` Message: ${message}` : ''}`,
        dueDate: selectedDateTime.toISOString().slice(0, 10),
        status: 'Completed',
        priority: 'Medium',
        assignedTo: coachId,
        clientId,
        createdBy: client.portalUserId || clientId,
        createdAt: new Date().toISOString(),
      });

      batch.update(db.collection('clients').doc(clientId), {
        packages: updatedPackages,
        sessionsRemaining: updatedSessionsRemaining,
      });
      await batch.commit();
      return res.json({ success: true });
    } catch (error: any) {
      console.error('[API] Error in POST /api/sessions/book:', error);
      return res.status(500).json({ error: 'Failed to submit request. Please try again.' });
    }
  });

  app.post('/api/sessions/cancel', requireAuth, async (req, res) => {
    try {
      const { sessionId, clientId } = req.body;
      if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
      const { db, clients } = await getMemberClients(req);
      if (!db || clients.length === 0) {
        return res.status(403).json({ error: 'No member profile linked to this account' });
      }
      if (!clientId || !clients.includes(clientId)) {
        return res.status(403).json({ error: 'You can only manage bookings for your own profile.' });
      }

      const sessionDoc = await db.collection('sessions').doc(sessionId).get();
      if (!sessionDoc.exists) return res.status(404).json({ error: 'Session not found.' });
      const session = sessionDoc.data() || {};
      if (session.clientId !== clientId) {
        return res.status(403).json({ error: 'You can only cancel your own sessions.' });
      }

      // 1-hour cancellation rule
      const sessionStart = new Date(session.date).getTime();
      if (!isNaN(sessionStart) && sessionStart - Date.now() < 3600000) {
        return res.status(400).json({ error: 'Sessions cannot be cancelled less than 1 hour before start time.' });
      }

      const clientDoc = await db.collection('clients').doc(clientId).get();
      if (!clientDoc.exists) return res.status(404).json({ error: 'Member profile not found.' });
      const client = clientDoc.data() || {};

      const updatedPackages = Array.isArray(client.packages) ? client.packages.map((p: any) => ({ ...p })) : [];
      let updatedSessionsRemaining = client.sessionsRemaining;
      const pkgToRefund = updatedPackages.find((p: any) => {
        if (p.status !== 'Active') return false;
        const nameUpper = String(p.packageName || '').toUpperCase();
        return nameUpper.includes('PT') || nameUpper.includes('PERSONAL');
      });
      if (pkgToRefund && pkgToRefund.sessionsRemaining !== 'unlimited') {
        pkgToRefund.sessionsRemaining = (Number(pkgToRefund.sessionsRemaining) || 0) + 1;
      }
      if (client.sessionsRemaining !== 'unlimited') {
        updatedSessionsRemaining = (Number(client.sessionsRemaining) || 0) + 1;
      }

      const batch = db.batch();
      batch.update(db.collection('sessions').doc(sessionId), { status: 'Cancelled' });
      batch.update(db.collection('clients').doc(clientId), {
        packages: updatedPackages,
        sessionsRemaining: updatedSessionsRemaining,
      });
      const auditRef = db.collection('auditLogs').doc();
      batch.set(auditRef, {
        action: 'UPDATE',
        entityType: 'SESSION',
        entityId: sessionId,
        details: `PT Session ${sessionId} cancelled by client ID ${clientId}. PT session refunded.`,
        timestamp: new Date().toISOString(),
        userId: client.portalUserId || clientId,
        userName: client.name,
      });
      await batch.commit();
      return res.json({ success: true });
    } catch (error: any) {
      console.error('[API] Error in POST /api/sessions/cancel:', error);
      return res.status(500).json({ error: 'Failed to cancel session.' });
    }
  });

  app.post('/api/sessions/reschedule', requireAuth, async (req, res) => {
    try {
      const { sessionId, dateISO, clientId } = req.body;
      if (!sessionId || !dateISO) {
        return res.status(400).json({ error: 'sessionId and dateISO are required' });
      }
      const { db, clients } = await getMemberClients(req);
      if (!db || clients.length === 0) {
        return res.status(403).json({ error: 'No member profile linked to this account' });
      }
      if (!clientId || !clients.includes(clientId)) {
        return res.status(403).json({ error: 'You can only manage bookings for your own profile.' });
      }

      const sessionDoc = await db.collection('sessions').doc(sessionId).get();
      if (!sessionDoc.exists) return res.status(404).json({ error: 'Session not found.' });
      const session = sessionDoc.data() || {};
      if (session.clientId !== clientId) {
        return res.status(403).json({ error: 'You can only reschedule your own sessions.' });
      }

      // 1-hour reschedule rule
      const sessionStart = new Date(session.date).getTime();
      if (!isNaN(sessionStart) && sessionStart - Date.now() < 3600000) {
        return res.status(400).json({ error: 'Sessions cannot be rescheduled less than 1 hour before start time.' });
      }

      const selectedDateTime = new Date(dateISO);
      if (isNaN(selectedDateTime.getTime())) return res.status(400).json({ error: 'Invalid date.' });
      if (selectedDateTime <= new Date()) {
        return res.status(400).json({ error: 'Please select a future date and time.' });
      }

      const coachId = session.trainerId;

      // Validate coach schedule
      const scheduleSnap = await db.collection('coachSchedules').doc(coachId || '').get();
      if (scheduleSnap.exists && scheduleSnap.data()?.days) {
        const days = scheduleSnap.data().days;
        const dayOfWeek = selectedDateTime.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
        const dayConfig = days?.[dayOfWeek];
        if (!dayConfig || !dayConfig.enabled) {
          return res.status(400).json({ error: `The coach is not available on ${selectedDateTime.toLocaleDateString('en-US', { weekday: 'long' })}s.` });
        }
        const bookingMinutes = selectedDateTime.getHours() * 60 + selectedDateTime.getMinutes();
        const [startHours, startMinutes] = String(dayConfig.startTime || '').split(':').map(Number);
        const [endHours, endMinutes] = String(dayConfig.endTime || '').split(':').map(Number);
        const startTotal = (startHours || 0) * 60 + (startMinutes || 0);
        const endTotal = (endHours || 0) * 60 + (endMinutes || 0);
        if (bookingMinutes < startTotal || bookingMinutes > endTotal) {
          return res.status(400).json({ error: `The coach is only available between ${dayConfig.startTime} and ${dayConfig.endTime} on ${selectedDateTime.toLocaleDateString('en-US', { weekday: 'long' })}s.` });
        }
      }

      // Conflict check (excluding this session)
      const coachSessionsSnap = await db.collection('sessions')
        .where('trainerId', '==', coachId || '')
        .where('status', '==', 'Scheduled')
        .get();
      const requestedTime = selectedDateTime.getTime();
      const isBooked = coachSessionsSnap.docs.some((d: any) => {
        if (d.id === sessionId) return false;
        const existingTime = new Date(d.data()?.date).getTime();
        const differenceMinutes = Math.abs(requestedTime - existingTime) / (1000 * 60);
        return differenceMinutes < 60;
      });
      if (isBooked) {
        return res.status(400).json({ error: 'This coach is already booked within this hour. Please choose another time.' });
      }

      const batch = db.batch();
      batch.update(db.collection('sessions').doc(sessionId), {
        date: selectedDateTime.toISOString(),
      });
      const auditRef = db.collection('auditLogs').doc();
      batch.set(auditRef, {
        action: 'UPDATE',
        entityType: 'SESSION',
        entityId: sessionId,
        details: `PT Session rescheduled for client ID ${clientId} to ${selectedDateTime.toISOString()}.`,
        timestamp: new Date().toISOString(),
        userId: clientId,
        userName: clientId,
      });
      await batch.commit();
      return res.json({ success: true });
    } catch (error: any) {
      console.error('[API] Error in POST /api/sessions/reschedule:', error);
      return res.status(500).json({ error: 'Failed to reschedule session.' });
    }
  });
}
