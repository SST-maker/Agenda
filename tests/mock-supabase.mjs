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
  events: []
};

class Query {
  constructor(table) { this.table = table; this.filters = []; this.action = 'select'; this.payload = null; }
  select() { this.action = 'select'; return this; }
  eq(key, value) { this.filters.push([key, value]); return this; }
  order() { return this; }
  maybeSingle() { return Promise.resolve(this.run()); }
  single() { return Promise.resolve(this.run()); }
  upsert(value) { this.action = 'upsert'; this.payload = value; return Promise.resolve(this.run()); }
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
    removeChannel() {}
  };
}
