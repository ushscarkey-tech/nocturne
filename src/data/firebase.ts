import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type Auth,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  where,
  writeBatch,
  type Firestore,
  type WriteBatch,
} from "firebase/firestore";
import { normalizeData, type CollectionName, type NocturneData, type Profile } from "@/core/types";
import { COLLECTIONS, type ChangeSet, type Repository } from "./repository";
import type { CloudBackend } from "./cloud";

/**
 * Firebase backend: Auth (email + password) and Firestore.
 *
 *   users/{uid}                 profile
 *   users/{uid}/{collection}/{id}  lines, tasks, windows, sessions, journeys, tickets
 *
 * Security rules (firestore.rules) let each traveller read and write only
 * their own tree.
 */

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

function firebase(): { app: FirebaseApp; auth: Auth; db: Firestore } {
  if (!isFirebaseConfigured) throw new Error("Firebase is not configured.");
  app ??= getApps()[0] ?? initializeApp(config);
  // Offline-first: writes land in the local cache at once and sync when online.
  db ??= initializeFirestore(app, {
    ignoreUndefinedProperties: true,
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  return { app, auth: getAuth(app), db };
}

/** Firestore allows at most 500 writes per batch. */
const BATCH_LIMIT = 450;
/** How long a save waits for the server before letting the next change through. */
const ACK_WAIT_MS = 2500;
const HISTORY_DAYS = 120;

type Entity = { id: string };

export class FirebaseRepository implements Repository {
  readonly kind = "firebase" as const;

  constructor(
    private readonly userId: string,
    /** Called when a write that was already let through fails later. */
    private readonly onLateError: (message: string) => void = () => {},
  ) {}

  private get db() {
    return firebase().db;
  }

  private col(name: CollectionName) {
    return collection(this.db, "users", this.userId, name);
  }

  async load(): Promise<NocturneData | null> {
    const profileSnap = await getDoc(doc(this.db, "users", this.userId));
    if (!profileSnap.exists()) return null;
    const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10);
    const results = await Promise.all(
      COLLECTIONS.map(async (name) => {
        const source = name === "sessions" || name === "journeys" ? query(this.col(name), where("date", ">=", since)) : this.col(name);
        const snap = await getDocs(source);
        return [name, snap.docs.map((d) => ({ ...d.data(), id: d.id }))] as const;
      }),
    );
    const collections = Object.fromEntries(results) as unknown as Pick<NocturneData, CollectionName>;
    return normalizeData({ profile: { ...(profileSnap.data() as Profile), id: this.userId }, ...collections });
  }

  async save(_next: NocturneData, changes: ChangeSet): Promise<void> {
    const batches = this.batches((write) => {
      if (changes.profile) write((b) => b.set(doc(this.db, "users", this.userId), { ...changes.profile }));
      for (const name of COLLECTIONS) {
        for (const e of (changes.upserts[name] ?? []) as Entity[]) write((b) => b.set(doc(this.col(name), e.id), { ...e }));
        for (const id of changes.deletes[name] ?? []) write((b) => b.delete(doc(this.col(name), id)));
      }
    });
    await this.commit(batches);
  }

  async replaceAll(next: NocturneData): Promise<void> {
    const existing = await Promise.all(COLLECTIONS.map(async (name) => [name, (await getDocs(this.col(name))).docs.map((d) => d.id)] as const));
    const batches = this.batches((write) => {
      for (const [name, ids] of existing) for (const id of ids) write((b) => b.delete(doc(this.col(name), id)));
      write((b) => b.set(doc(this.db, "users", this.userId), { ...next.profile }));
      for (const name of COLLECTIONS) for (const e of next[name] as Entity[]) write((b) => b.set(doc(this.col(name), e.id), { ...e }));
    });
    await this.commit(batches);
  }

  private batches(fill: (write: (op: (b: WriteBatch) => void) => void) => void): WriteBatch[] {
    const list: WriteBatch[] = [];
    let count = BATCH_LIMIT;
    fill((op) => {
      if (count >= BATCH_LIMIT) {
        list.push(writeBatch(this.db));
        count = 0;
      }
      op(list[list.length - 1]);
      count += 1;
    });
    return list;
  }

  /**
   * Commits are issued in order and kept by the local cache even offline.
   * Wait briefly for the server so errors surface, but never hold the
   * queue of later changes while the network is away.
   */
  private async commit(batches: WriteBatch[]): Promise<void> {
    if (batches.length === 0) return;
    const all = Promise.all(batches.map((b) => b.commit()));
    let settled = false;
    const done = all.then(
      () => {
        settled = true;
      },
      (e: unknown) => {
        const message = e instanceof Error ? e.message : "Changes could not be saved.";
        if (settled) this.onLateError(message);
        settled = true;
        throw e;
      },
    );
    await Promise.race([done, new Promise<void>((r) => setTimeout(r, ACK_WAIT_MS))]);
    if (!settled) {
      settled = true;
      done.catch(() => {});
    }
  }
}

function authMessage(e: unknown): Error {
  const code = (e as { code?: string })?.code ?? "";
  const map: Record<string, string> = {
    "auth/invalid-credential": "auth.errorCredentials",
    "auth/wrong-password": "auth.errorCredentials",
    "auth/user-not-found": "auth.errorCredentials",
    "auth/invalid-email": "auth.errorEmail",
    "auth/email-already-in-use": "auth.errorEmailInUse",
    "auth/weak-password": "auth.errorWeakPassword",
    "auth/too-many-requests": "auth.errorTooMany",
    "auth/network-request-failed": "auth.errorNetwork",
    "auth/missing-email": "auth.resetNeedEmail",
    "auth/popup-blocked": "auth.errorPopupBlocked",
    "auth/popup-closed-by-user": "auth.cancelled",
    "auth/cancelled-popup-request": "auth.cancelled",
    "auth/unauthorized-domain": "auth.errorDomain",
    "auth/operation-not-allowed": "auth.errorProviderOff",
    "auth/account-exists-with-different-credential": "auth.errorOtherMethod",
  };
  if (!map[code]) console.warn("[nocturne] sign-in failed:", e);
  const err = new Error(map[code] ?? "auth.errorDefault");
  (err as Error & { i18nKey?: string }).i18nKey = map[code];
  return err;
}

export const firebaseBackend: CloudBackend = {
  kind: "firebase",
  async currentUser() {
    const { auth } = firebase();
    await auth.authStateReady();
    const u = auth.currentUser;
    return u ? { id: u.uid, email: u.email, name: u.displayName } : null;
  },
  async signIn(email, password) {
    try {
      await signInWithEmailAndPassword(firebase().auth, email, password);
    } catch (e) {
      throw authMessage(e);
    }
  },
  async signUp(name, email, password) {
    try {
      const cred = await createUserWithEmailAndPassword(firebase().auth, email, password);
      if (name) await updateProfile(cred.user, { displayName: name });
      return "signed-in";
    } catch (e) {
      throw authMessage(e);
    }
  },
  async signOut() {
    await firebaseSignOut(firebase().auth);
  },
  async signInWithGoogle() {
    // A popup, not a redirect: redirects break in Safari when the app and
    // the auth domain aren't the same site.
    try {
      await signInWithPopup(firebase().auth, new GoogleAuthProvider());
    } catch (e) {
      throw authMessage(e);
    }
  },
  async resetPassword(email) {
    try {
      await sendPasswordResetEmail(firebase().auth, email);
    } catch (e) {
      throw authMessage(e);
    }
  },
  repository(userId, onLateError) {
    return new FirebaseRepository(userId, onLateError);
  },
};
