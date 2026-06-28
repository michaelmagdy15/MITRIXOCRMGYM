# Gym CRM ↔ Mobile Sync Mechanism (`sdk`)
Last updated: 2026-06-19

## What it does
It's a minimal event bus that lets the desktop React CRM and the mobile app exchange structured change events in real time using a single Firestore collection called `sync_queue`. Think of it as your internal "something happened" channel so that any major action on either side can be observed, reacted to, or logged by other services — without tight coupling between components.

## How to add it
```typescript
sdk.add('name', function (value: any) { ... })  // register an event listener
sdk.fire('name', payload)                       // emit a new change
sdk.watch({ name: 'lead.updated' }, cb)         // shorthand for one-shot subscription
```

It writes each fired message to Firestore under `sync_queue`, so mobile and desktop both read the same source of truth. Event handlers run anywhere with access to your Firebase config — perfect for cross-platform notifications, push triggers, webhook delivery, or UI refreshes across both apps.

