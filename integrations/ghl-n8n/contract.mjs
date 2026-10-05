/** Pure contact handoff planner, also embedded verbatim in n8n exports.
 * Configuration belongs to the workflow operator; event data cannot select a tenant.
 * This module performs no I/O and grants no authority to contact a person.
 */
export function planContact(event, config) {
  const fail = (reason) => ({ status: 'rejected', reason });
  if (!event || typeof event !== 'object' || Array.isArray(event)) return fail('invalid_event');
  if (!config || typeof config.locationId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(config.locationId)) return fail('invalid_location');
  if (typeof config.projectId !== 'string' || !/^[A-Z]+-[0-9]{2}$/.test(config.projectId)) return fail('invalid_project');
  if (event.projectId !== config.projectId) return fail('project_mismatch');
  if (event.locationId !== undefined && event.locationId !== config.locationId) return fail('tenant_mismatch');
  if (typeof event.eventId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(event.eventId)) return fail('invalid_event_id');
  // Contact storage consent is distinct from permission to send marketing.
  if (event.storageConsent !== true) return fail('storage_consent_required');
  if (event.sensitive === true) return fail('sensitive_record');
  const contact = event.contact;
  if (!contact || typeof contact !== 'object' || Array.isArray(contact)) return fail('invalid_contact');
  const email = typeof contact.email === 'string' ? contact.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('invalid_email');
  const body = { locationId: config.locationId, email, source: `portfolio:${config.projectId}` };
  for (const key of ['firstName', 'lastName']) {
    if (contact[key] !== undefined) {
      if (typeof contact[key] !== 'string' || contact[key].length > 100) return fail('invalid_name');
      body[key] = contact[key].trim();
    }
  }
  // Deliberately omit tags, DND, phone, free text and custom fields: an upsert
  // must not replace tags, loosen existing opt-outs or copy sensitive records.
  return {
    status: 'ready', projectId: config.projectId,
    eventKey: `${config.locationId}:${config.projectId}:${event.eventId}`,
    request: { method: 'POST', url: 'https://services.leadconnectorhq.com/contacts/upsert',
      headers: { Version: 'v3', 'Content-Type': 'application/json' }, body },
    communicationAllowed: false,
  };
}
