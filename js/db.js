// ─────────────────────────────────────────────────────────────
// 데이터 저장소 어댑터
//   - Firebase Firestore (운영)  : clubs/{CLUB_ID}/{collection}/{id}
//   - localStorage (체험 모드)  : 이 브라우저에만 저장
// 두 어댑터 모두 같은 인터페이스: start(onChange) / put / remove / batch
// ─────────────────────────────────────────────────────────────
import { FIREBASE_CONFIG, CLUB_ID } from './config.js';

export const COLLECTIONS = ['players', 'guests', 'schedules', 'attendance', 'matches', 'coinLogs', 'settings', 'items', 'purchases', 'avatars', 'ballLogs', 'rallyScores', 'analyses'];

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';

class LocalDB {
  constructor() {
    this.mode = 'local';
    this.key = 'offcourt-db-v1';
    this.chan = 'BroadcastChannel' in window ? new BroadcastChannel(this.key) : null;
  }
  read() {
    try {
      return JSON.parse(localStorage.getItem(this.key)) || {};
    } catch {
      return {};
    }
  }
  write(data) {
    localStorage.setItem(this.key, JSON.stringify(data));
    this.chan?.postMessage('changed');
  }
  async start(onChange) {
    this.onChange = onChange;
    const emit = () => {
      const d = this.read();
      for (const c of COLLECTIONS) onChange(c, Object.values(d[c] || {}));
    };
    if (this.chan) this.chan.onmessage = emit;
    window.addEventListener('storage', (e) => e.key === this.key && emit());
    emit();
  }
  async batch(ops) {
    const d = this.read();
    const touched = new Set();
    for (const op of ops) {
      d[op.col] ||= {};
      if (op.type === 'put') d[op.col][op.doc.id] = op.doc;
      else delete d[op.col][op.id];
      touched.add(op.col);
    }
    this.write(d);
    for (const c of touched) this.onChange(c, Object.values(d[c] || {}));
  }
  async replaceAll(snapshot) {
    const d = {};
    for (const c of COLLECTIONS) d[c] = Object.fromEntries((snapshot[c] || []).map((x) => [x.id, x]));
    this.write(d);
    for (const c of COLLECTIONS) this.onChange(c, snapshot[c] || []);
  }
}

class FirestoreDB {
  constructor() {
    this.mode = 'firebase';
  }
  async start(onChange) {
    const [{ initializeApp }, fs] = await Promise.all([
      import(FB + 'firebase-app.js'),
      import(FB + 'firebase-firestore.js'),
    ]);
    this.fs = fs;
    const app = initializeApp(FIREBASE_CONFIG);
    try {
      this.db = fs.initializeFirestore(app, {
        localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
      });
    } catch (e) {
      // 사파리 개인정보 보호 모드 등 오프라인 저장소를 못 쓰는 환경
      console.warn('persistent cache unavailable', e);
      this.db = fs.getFirestore(app);
    }
    const first = COLLECTIONS.map(
      (c) =>
        new Promise((resolve, reject) => {
          fs.onSnapshot(
            fs.collection(this.db, 'clubs', CLUB_ID, c),
            (snap) => {
              onChange(c, snap.docs.map((d) => d.data()));
              resolve();
            },
            (err) => {
              console.error(err);
              reject(err);
            }
          );
        })
    );
    await Promise.all(first);
  }
  ref(col, id) {
    return this.fs.doc(this.db, 'clubs', CLUB_ID, col, id);
  }
  async batch(ops) {
    const b = this.fs.writeBatch(this.db);
    for (const op of ops) {
      if (op.type === 'put') b.set(this.ref(op.col, op.doc.id), clean(op.doc));
      else b.delete(this.ref(op.col, op.id));
    }
    await b.commit();
  }
  async replaceAll(snapshot) {
    // 기존 문서 삭제 후 백업 내용으로 교체 (500개 단위)
    const ops = [];
    for (const c of COLLECTIONS) {
      const snap = await this.fs.getDocs(this.fs.collection(this.db, 'clubs', CLUB_ID, c));
      snap.docs.forEach((d) => ops.push({ type: 'del', col: c, id: d.id }));
      (snapshot[c] || []).forEach((doc) => ops.push({ type: 'put', col: c, doc }));
    }
    for (let i = 0; i < ops.length; i += 450) await this.batch(ops.slice(i, i + 450));
  }
}

// Firestore는 undefined 값을 거부하므로 제거
const clean = (o) => JSON.parse(JSON.stringify(o));

export const db = FIREBASE_CONFIG ? new FirestoreDB() : new LocalDB();

export const put = (col, doc) => db.batch([{ type: 'put', col, doc }]);
export const remove = (col, id) => db.batch([{ type: 'del', col, id }]);
export const batch = (ops) => db.batch(ops);

export const uid = (p = '') =>
  p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
