const familyId = '11111111-1111-4111-8111-111111111111';
const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

export const mockDb = {
  profile: { display_name: 'Nacer', avatar_url: null },
  membership: { family_id: familyId, role: 'admin' },
  family: { id: familyId, name: 'Famille Hamadi', symbol: '🌿', quiet_mode: false, invite_expires_at: null },
  members: [
    { id:'22222222-2222-4222-8222-222222222222', family_id:familyId, name:'Nacer', nickname:null, role_label:'Papa', initials:'NA', color:'#224A54', linked_user_id:userId, sort_order:10 },
    { id:'33333333-3333-4333-8333-333333333333', family_id:familyId, name:'Romane', nickname:null, role_label:'Maman', initials:'RO', color:'#C79A5C', linked_user_id:null, sort_order:20 },
    { id:'44444444-4444-4444-8444-444444444444', family_id:familyId, name:'Chacha', nickname:null, role_label:'Enfant', initials:'CH', color:'#739A87', linked_user_id:null, sort_order:30 }
  ],
  events: [],
  tasks: [],
  shoppingItems: [],
  routines: [],
  routineCompletions: [],
  notificationPreferences: null,
  comments: [], reactions: [], reads: [], attachments: [], activity: [],
  pushSubscriptions: []
};

class Query {
  constructor(table) { this.table = table; this.filters = []; this.action = 'select'; this.payload = null; }
  select() { this.action = 'select'; return this; }
  eq(key, value) { this.filters.push([key, value]); return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return Promise.resolve(this.run()); }
  single() { return Promise.resolve(this.run()); }
  upsert(value) { this.action = 'upsert'; this.payload = value; return Promise.resolve(this.run()); }
  insert(value) { this.action = 'insert'; this.payload = value; return Promise.resolve(this.run()); }
  update(value) { this.action = 'update'; this.payload = value; return this; }
  delete() { this.action = 'delete'; return this; }
  then(resolve, reject) { return Promise.resolve(this.run()).then(resolve, reject); }

  run() {
    if (this.action === 'select') {
      if (this.table === 'profiles') return { data: mockDb.profile, error: null };
      if (this.table === 'family_users') return { data: mockDb.membership, error: null };
      if (this.table === 'families') return { data: mockDb.family, error: null };
      if (this.table === 'members') return { data: structuredClone(mockDb.members), error: null };
      if (this.table === 'events') return { data: structuredClone(mockDb.events), error: null };
      if (this.table === 'tasks') return { data: structuredClone(mockDb.tasks), error: null };
      if (this.table === 'shopping_items') return { data: structuredClone(mockDb.shoppingItems), error: null };
      if (this.table === 'routines') return { data: structuredClone(mockDb.routines), error: null };
      if (this.table === 'routine_completions') return { data: structuredClone(mockDb.routineCompletions), error: null };
      if (this.table === 'content_comments') return { data: structuredClone(mockDb.comments), error: null };
      if (this.table === 'content_reactions') return { data: structuredClone(mockDb.reactions), error: null };
      if (this.table === 'content_reads') return { data: structuredClone(mockDb.reads), error: null };
      if (this.table === 'content_attachments') return { data: structuredClone(mockDb.attachments), error: null };
      if (this.table === 'activity_log') return { data: structuredClone(mockDb.activity), error: null };
      if (this.table === 'notification_preferences') return { data: mockDb.notificationPreferences ? structuredClone(mockDb.notificationPreferences) : null, error: null };
      if (this.table === 'push_subscriptions') return { data: structuredClone(mockDb.pushSubscriptions), error: null };
    }
    if (this.table === 'events' && this.action === 'upsert') {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      for (const payload of rows) {
        const index = mockDb.events.findIndex((event) => event.id === payload.id);
        const row = { ...payload, updated_at: new Date().toISOString() };
        if (index >= 0) mockDb.events[index] = { ...mockDb.events[index], ...row };
        else mockDb.events.push(row);
      }
      return { data: null, error: null };
    }
    if (this.table === 'events' && this.action === 'delete') {
      const id = this.filters.find(([key]) => key === 'id')?.[1];
      const seriesId = this.filters.find(([key]) => key === 'series_id')?.[1];
      if (id) mockDb.events = mockDb.events.filter((event) => event.id !== id);
      else if (seriesId) mockDb.events = mockDb.events.filter((event) => event.series_id !== seriesId);
      else mockDb.events = [];
      return { data: null, error: null };
    }
    if (this.table === 'tasks' && this.action === 'upsert') {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      for (const payload of rows) {
        const index = mockDb.tasks.findIndex((task) => task.id === payload.id);
        const row = { ...payload, updated_at: new Date().toISOString() };
        if (index >= 0) mockDb.tasks[index] = { ...mockDb.tasks[index], ...row };
        else mockDb.tasks.push(row);
      }
      return { data: null, error: null };
    }
    if (this.table === 'tasks' && this.action === 'delete') {
      const id = this.filters.find(([key]) => key === 'id')?.[1];
      if (id) mockDb.tasks = mockDb.tasks.filter((task) => task.id !== id);
      else mockDb.tasks = [];
      return { data: null, error: null };
    }
    if (this.table === 'shopping_items' && this.action === 'upsert') {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      for (const payload of rows) {
        const index = mockDb.shoppingItems.findIndex((item) => item.id === payload.id);
        const row = { ...payload, created_at: payload.created_at || new Date().toISOString(), updated_at: new Date().toISOString() };
        if (index >= 0) mockDb.shoppingItems[index] = { ...mockDb.shoppingItems[index], ...row };
        else mockDb.shoppingItems.push(row);
      }
      return { data: null, error: null };
    }
    if (this.table === 'shopping_items' && this.action === 'delete') {
      const id = this.filters.find(([key]) => key === 'id')?.[1];
      const checked = this.filters.find(([key]) => key === 'checked')?.[1];
      if (id) mockDb.shoppingItems = mockDb.shoppingItems.filter((item) => item.id !== id);
      else if (checked === true) mockDb.shoppingItems = mockDb.shoppingItems.filter((item) => !item.checked);
      else mockDb.shoppingItems = [];
      return { data: null, error: null };
    }
    if (this.table === 'routines' && this.action === 'upsert') {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      for (const payload of rows) {
        const index = mockDb.routines.findIndex((item) => item.id === payload.id);
        const row = { ...payload, updated_at: new Date().toISOString() };
        if (index >= 0) mockDb.routines[index] = { ...mockDb.routines[index], ...row };
        else mockDb.routines.push(row);
      }
      return { data: null, error: null };
    }
    if (this.table === 'routines' && this.action === 'delete') {
      const id = this.filters.find(([key]) => key === 'id')?.[1];
      if (id) {
        mockDb.routines = mockDb.routines.filter((item) => item.id !== id);
        mockDb.routineCompletions = mockDb.routineCompletions.filter((item) => item.routine_id !== id);
      } else {
        mockDb.routines = [];
        mockDb.routineCompletions = [];
      }
      return { data: null, error: null };
    }
    if (this.table === 'routine_completions' && this.action === 'upsert') {
      const payload = this.payload;
      const index = mockDb.routineCompletions.findIndex((item) => item.routine_id === payload.routine_id && item.completion_date === payload.completion_date);
      const row = { ...payload, created_at: new Date().toISOString() };
      if (index >= 0) mockDb.routineCompletions[index] = row; else mockDb.routineCompletions.push(row);
      return { data: null, error: null };
    }
    if (this.table === 'routine_completions' && this.action === 'delete') {
      const routineId = this.filters.find(([key]) => key === 'routine_id')?.[1];
      const date = this.filters.find(([key]) => key === 'completion_date')?.[1];
      mockDb.routineCompletions = mockDb.routineCompletions.filter((item) => {
        if (routineId && item.routine_id !== routineId) return true;
        if (date && item.completion_date !== date) return true;
        return false;
      });
      return { data: null, error: null };
    }

    if (this.table === 'content_comments' && this.action === 'insert') {
      const row = { ...this.payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      mockDb.comments.push(row);
      return { data: null, error: null };
    }
    if (this.table === 'content_comments' && this.action === 'delete') {
      const id = this.filters.find(([key]) => key === 'id')?.[1];
      mockDb.comments = mockDb.comments.filter((item) => item.id !== id);
      return { data: null, error: null };
    }
    if (this.table === 'content_reactions' && this.action === 'insert') {
      mockDb.reactions.push({ ...this.payload, created_at: new Date().toISOString() });
      return { data: null, error: null };
    }
    if (this.table === 'content_reactions' && this.action === 'delete') {
      const parentType = this.filters.find(([key]) => key === 'parent_type')?.[1];
      const parentId = this.filters.find(([key]) => key === 'parent_id')?.[1];
      const user = this.filters.find(([key]) => key === 'user_id')?.[1];
      const reaction = this.filters.find(([key]) => key === 'reaction')?.[1];
      mockDb.reactions = mockDb.reactions.filter((item) => !(item.parent_type === parentType && item.parent_id === parentId && item.user_id === user && item.reaction === reaction));
      return { data: null, error: null };
    }
    if (this.table === 'content_reads' && this.action === 'upsert') {
      const row = { ...this.payload };
      const index = mockDb.reads.findIndex((item) => item.parent_type === row.parent_type && item.parent_id === row.parent_id && item.user_id === row.user_id);
      if (index >= 0) mockDb.reads[index] = row; else mockDb.reads.push(row);
      return { data: null, error: null };
    }

    if (this.table === 'notification_preferences' && this.action === 'upsert') {
      mockDb.notificationPreferences = { ...this.payload, updated_at: new Date().toISOString() };
      return { data: null, error: null };
    }
    if (this.table === 'push_subscriptions' && this.action === 'upsert') {
      const index = mockDb.pushSubscriptions.findIndex((item) => item.endpoint === this.payload.endpoint);
      const row = { id: this.payload.id || '77777777-7777-4777-8777-777777777777', ...this.payload };
      if (index >= 0) mockDb.pushSubscriptions[index] = row; else mockDb.pushSubscriptions.push(row);
      return { data: null, error: null };
    }
    if (this.table === 'push_subscriptions' && this.action === 'delete') {
      const endpoint = this.filters.find(([key]) => key === 'endpoint')?.[1];
      mockDb.pushSubscriptions = mockDb.pushSubscriptions.filter((item) => item.endpoint !== endpoint);
      return { data: null, error: null };
    }
    if (this.table === 'push_subscriptions' && this.action === 'update') {
      const id = this.filters.find(([key]) => key === 'id')?.[1];
      mockDb.pushSubscriptions = mockDb.pushSubscriptions.map((item) => !id || item.id === id ? { ...item, ...this.payload } : item);
      return { data: null, error: null };
    }
    if (this.table === 'families' && this.action === 'update') {
      mockDb.family = { ...mockDb.family, ...this.payload };
      return { data: null, error: null };
    }
    return { data: null, error: null };
  }
}

export function createClient() {
  const session = {
    access_token: 'mock-access-token',
    user: { id: userId, email: 'nacer@example.fr', user_metadata: { display_name: 'Nacer' } }
  };
  return {
    auth: {
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
      async getSession() { return { data: { session }, error: null }; },
      async signOut() { return { error: null }; },
      async signInWithPassword() { return { data: { session }, error: null }; },
      async signUp() { return { data: { session }, error: null }; },
      async resetPasswordForEmail() { return { error: null }; },
      async updateUser() { return { error: null }; }
    },
    from(table) { return new Query(table); },
    async rpc(name, args = {}) {
      if (name === 'rotate_family_invite') return { data: 'AGENDA-ABCDEF123456', error: null };
      if (name === 'update_family_identity') { mockDb.family.name = args.p_name; mockDb.family.symbol = args.p_symbol; return { data: {}, error: null }; }
      if (name === 'update_member_presentation') { const m = mockDb.members.find((item) => item.id === args.p_member_id); if (m) { m.nickname = args.p_nickname; m.color = args.p_color; m.avatar_url = args.p_avatar_url; } return { data: {}, error: null }; }
      if (name === 'update_my_avatar') { mockDb.profile.avatar_url = args.p_avatar_url; const m = mockDb.members.find((item) => item.linked_user_id === userId); if (m) m.avatar_url = args.p_avatar_url; return { data: {}, error: null }; }
      return { data: {}, error: null };
    },
    channel() { return { on() { return this; }, subscribe(callback) { callback('SUBSCRIBED'); return this; } }; },
    removeChannel() {},
    storage: {
      from() { return {
        async upload(path, file) { return { data: { path }, error: null }; },
        async remove() { return { data: [], error: null }; },
        async createSignedUrl(path) { return { data: { signedUrl: `https://example.test/${path}` }, error: null }; }
      }; }
    }
  };
}
