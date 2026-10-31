// Cloud sync is off in the app (lib/supabase.ts): nothing leaves the device in tests either
const noop = new Proxy(function () {}, { get: () => noop, apply: () => Promise.resolve({ data: null, error: null }) });
module.exports = { isSupabaseConfigured: false, CLOUD_SYNC_ENABLED: false, isCloudSyncActive: false, supabase: noop };
