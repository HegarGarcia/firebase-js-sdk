/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as firestore from '../index';

import { initializeApp } from '@firebase/app-exp';
import { expect, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';

import {
  Firestore,
  getFirestore,
  initializeFirestore,
  terminate
} from '../src/api/database';
import {
  withTestCollection,
  withTestCollectionAndInitialData,
  withTestDb,
  withTestDbSettings,
  withTestDoc,
  withTestDocAndInitialData
} from './helpers';
import {
  parent,
  collection,
  CollectionReference,
  doc,
  DocumentReference,
  getDoc,
  deleteDoc,
  setDoc,
  addDoc,
  updateDoc,
  refEqual,
  queryEqual,
  collectionGroup,
  getQuery
} from '../src/api/reference';
import { FieldPath } from '../src/api/field_path';
import {
  DEFAULT_PROJECT_ID,
  DEFAULT_SETTINGS
} from '../../test/integration/util/settings';
import { writeBatch } from '../src/api/write_batch';
import { runTransaction } from '../src/api/transaction';
import { expectEqual, expectNotEqual } from '../../test/util/helpers';
import { snapshotEqual } from '../src/api/snapshot';
import {
  FieldValue,
  deleteField,
  increment,
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from '../src/api/field_value';
import { Timestamp } from '../../src/api/timestamp';

use(chaiAsPromised);

describe('Firestore', () => {
  it('can provide setting', () => {
    const app = initializeApp(
      { apiKey: 'fake-api-key', projectId: 'test-project' },
      'test-app-initializeFirestore'
    );
    const fs1 = initializeFirestore(app, { host: 'localhost', ssl: false });
    expect(fs1).to.be.an.instanceOf(Firestore);
  });

  it('returns same instance', () => {
    const app = initializeApp(
      { apiKey: 'fake-api-key', projectId: 'test-project' },
      'test-app-getFirestore'
    );
    const fs1 = getFirestore(app);
    const fs2 = getFirestore(app);
    expect(fs1 === fs2).to.be.true;
  });

  it('cannot call initializeFirestore() twice', () => {
    const app = initializeApp(
      { apiKey: 'fake-api-key', projectId: 'test-project' },
      'test-app-initializeFirestore-twice'
    );
    initializeFirestore(app, { host: 'localhost', ssl: false });
    expect(() => {
      initializeFirestore(app, { host: 'localhost', ssl: false });
    }).to.throw(
      'Firestore has already been started and its settings can no longer be changed.'
    );
  });

  it('cannot use once terminated', () => {
    const app = initializeApp(
      { apiKey: 'fake-api-key', projectId: 'test-project' },
      'test-app-terminated'
    );
    const firestore = initializeFirestore(app, {
      host: 'localhost',
      ssl: false
    });

    // We don't await the Promise. Any operation enqueued after should be
    // rejected.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    terminate(firestore);

    return expect(
      getDoc(doc(firestore, 'coll/doc'))
    ).to.be.eventually.rejectedWith('The client has already been terminated.');
  });

  it('can call terminate() multiple times', () => {
    const app = initializeApp(
      { apiKey: 'fake-api-key', projectId: 'test-project' },
      'test-app-multi-terminate'
    );
    const firestore = initializeFirestore(app, {
      host: 'localhost',
      ssl: false
    });

    return terminate(firestore).then(() => terminate(firestore));
  });
});

describe('doc', () => {
  it('can provide name', () => {
    return withTestDb(db => {
      const result = doc(db, 'coll/doc');
      expect(result).to.be.an.instanceOf(DocumentReference);
      expect(result.id).to.equal('doc');
      expect(result.path).to.equal('coll/doc');
    });
  });

  it('validates path', () => {
    return withTestDb(db => {
      expect(() => doc(db, 'coll')).to.throw(
        'Invalid document path (coll). Path points to a collection.'
      );
      expect(() => doc(db, '')).to.throw(
        'Function doc() requires its second argument to be of type non-empty string, but it was: ""'
      );
      expect(() => doc(collection(db, 'coll'), 'doc/coll')).to.throw(
        'Invalid document path (coll/doc/coll). Path points to a collection.'
      );
      expect(() => doc(db, 'coll//doc')).to.throw(
        'Invalid path (coll//doc). Paths must not contain // in them.'
      );
    });
  });

  it('supports AutoId', () => {
    return withTestDb(db => {
      const coll = collection(db, 'coll');
      const ref = doc(coll);
      expect(ref.id.length).to.equal(20);
    });
  });
});

describe('collection', () => {
  it('can provide name', () => {
    return withTestDb(db => {
      const result = collection(db, 'coll/doc/subcoll');
      expect(result).to.be.an.instanceOf(CollectionReference);
      expect(result.id).to.equal('subcoll');
      expect(result.path).to.equal('coll/doc/subcoll');
    });
  });

  it('validates path', () => {
    return withTestDb(db => {
      expect(() => collection(db, 'coll/doc')).to.throw(
        'Invalid collection path (coll/doc). Path points to a document.'
      );
      // TODO(firestorelite): Explore returning a more helpful message
      // (e.g. "Empty document paths are not supported.")
      expect(() => collection(doc(db, 'coll/doc'), '')).to.throw(
        'Function doc() requires its second argument to be of type non-empty string, but it was: ""'
      );
      expect(() => collection(doc(db, 'coll/doc'), 'coll/doc')).to.throw(
        'Invalid collection path (coll/doc/coll/doc). Path points to a document.'
      );
    });
  });
});

describe('parent', () => {
  it('returns CollectionReferences for DocumentReferences', () => {
    return withTestDb(db => {
      const coll = collection(db, 'coll/doc/coll');
      const result = parent(coll);
      expect(result).to.be.an.instanceOf(DocumentReference);
      expect(result!.path).to.equal('coll/doc');
    });
  });

  it('returns DocumentReferences for CollectionReferences', () => {
    return withTestDb(db => {
      const coll = doc(db, 'coll/doc');
      const result = parent(coll);
      expect(result).to.be.an.instanceOf(CollectionReference);
      expect(result.path).to.equal('coll');
    });
  });

  it('returns null for root collection', () => {
    return withTestDb(db => {
      const coll = collection(db, 'coll');
      const result = parent(coll);
      expect(result).to.be.null;
    });
  });
});

describe('getDoc()', () => {
  it('can get a non-existing document', () => {
    return withTestDoc(async docRef => {
      const docSnap = await getDoc(docRef);
      expect(docSnap.exists()).to.be.false;
    });
  });

  it('can get an existing document', () => {
    return withTestDocAndInitialData({ val: 1 }, async docRef => {
      const docSnap = await getDoc(docRef);
      expect(docSnap.exists()).to.be.true;
    });
  });
});

/**
 * Shared test class that is used to verify the WriteBatch, Transaction and
 * DocumentReference-based mutation API.
 */
interface MutationTester {
  set<T>(documentRef: firestore.DocumentReference<T>, data: T): Promise<void>;
  set<T>(
    documentRef: firestore.DocumentReference<T>,
    data: Partial<T>,
    options: firestore.SetOptions
  ): Promise<void>;
  update(
    documentRef: firestore.DocumentReference<unknown>,
    data: firestore.UpdateData
  ): Promise<void>;
  update(
    documentRef: firestore.DocumentReference<unknown>,
    field: string | firestore.FieldPath,
    value: unknown,
    ...moreFieldsAndValues: unknown[]
  ): Promise<void>;
  delete(documentRef: firestore.DocumentReference<unknown>): Promise<void>;
}

genericMutationTests({
  set: setDoc,
  update: updateDoc,
  delete: deleteDoc
});

describe('WriteBatch', () => {
  class WriteBatchTester implements MutationTester {
    delete(ref: firestore.DocumentReference<unknown>): Promise<void> {
      const batch = writeBatch(ref.firestore);
      batch.delete(ref);
      return batch.commit();
    }

    set<T>(
      ref: firestore.DocumentReference<T>,
      data: T | Partial<T>,
      options?: firestore.SetOptions
    ): Promise<void> {
      const batch = writeBatch(ref.firestore);
      // TODO(mrschmidt): Find a way to remove the `any` cast here
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (batch.set as any).apply(batch, Array.from(arguments));
      return batch.commit();
    }

    update(
      ref: firestore.DocumentReference<unknown>,
      dataOrField: firestore.UpdateData | string | firestore.FieldPath,
      value?: unknown,
      ...moreFieldsAndValues: unknown[]
    ): Promise<void> {
      const batch = writeBatch(ref.firestore);
      // TODO(mrschmidt): Find a way to remove the `any` cast here
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (batch.update as any).apply(batch, Array.from(arguments));
      return batch.commit();
    }
  }

  genericMutationTests(new WriteBatchTester());

  it('can add multiple operations', () => {
    return withTestCollection(async coll => {
      const batch = writeBatch(coll.firestore);
      batch.set(doc(coll), { doc: 1 });
      batch.set(doc(coll), { doc: 2 });
      await batch.commit();

      // TODO(firestorelite): Verify collection contents once getQuery is added
    });
  });

  it('cannot add write after commit', () => {
    return withTestDoc(async doc => {
      const batch = writeBatch(doc.firestore);
      batch.set(doc, { doc: 1 });
      const op = batch.commit();
      expect(() => batch.delete(doc)).to.throw(
        'A write batch can no longer be used after commit() has been called.'
      );
      await op;
      expect(() => batch.delete(doc)).to.throw(
        'A write batch can no longer be used after commit() has been called.'
      );
    });
  });
});

describe('Transaction', () => {
  class TransactionTester implements MutationTester {
    delete(ref: firestore.DocumentReference<unknown>): Promise<void> {
      return runTransaction(ref.firestore, async transaction => {
        transaction.delete(ref);
      });
    }

    set<T>(
      ref: firestore.DocumentReference<T>,
      data: T | Partial<T>,
      options?: firestore.SetOptions
    ): Promise<void> {
      const args = Array.from(arguments);
      return runTransaction(ref.firestore, async transaction => {
        // TODO(mrschmidt): Find a way to remove the `any` cast here
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (transaction.set as any).apply(transaction, args);
      });
    }

    update(
      ref: firestore.DocumentReference<unknown>,
      dataOrField: firestore.UpdateData | string | firestore.FieldPath,
      value?: unknown,
      ...moreFieldsAndValues: unknown[]
    ): Promise<void> {
      const args = Array.from(arguments);
      return runTransaction(ref.firestore, async transaction => {
        // TODO(mrschmidt): Find a way to remove the `any` cast here
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (transaction.update as any).apply(transaction, args);
      });
    }
  }

  genericMutationTests(
    new TransactionTester(),
    /* validationUsesPromises= */ true
  );

  it('can read and then write', () => {
    return withTestDocAndInitialData({ counter: 1 }, async doc => {
      await runTransaction(doc.firestore, async transaction => {
        const snap = await transaction.get(doc);
        transaction.update(doc, 'counter', snap.get('counter') + 1);
      });
      const result = await getDoc(doc);
      expect(result.get('counter')).to.equal(2);
    });
  });

  it('can read non-existing doc then write', () => {
    return withTestDoc(async doc => {
      await runTransaction(doc.firestore, async transaction => {
        const snap = await transaction.get(doc);
        expect(snap.exists()).to.be.false;
        transaction.set(doc, { counter: 1 });
      });
      const result = await getDoc(doc);
      expect(result.get('counter')).to.equal(1);
    });
  });

  it('retries when document is modified', () => {
    return withTestDoc(async doc => {
      let retryCounter = 0;
      await runTransaction(doc.firestore, async transaction => {
        ++retryCounter;
        await transaction.get(doc);

        if (retryCounter === 1) {
          // Out of band modification that doesn't use the transaction
          await setDoc(doc, { counter: 'invalid' });
        }

        transaction.set(doc, { counter: 1 });
      });
      expect(retryCounter).to.equal(2);
      const result = await getDoc(doc);
      expect(result.get('counter')).to.equal(1);
    });
  });
});

function genericMutationTests(
  op: MutationTester,
  validationUsesPromises: boolean = false
): void {
  const setDoc = op.set;
  const updateDoc = op.update;
  const deleteDoc = op.delete;

  describe('delete', () => {
    it('can delete a non-existing document', () => {
      return withTestDoc(docRef => deleteDoc(docRef));
    });

    it('can delete an existing document', () => {
      return withTestDoc(async docRef => {
        await setDoc(docRef, {});
        await deleteDoc(docRef);
        const docSnap = await getDoc(docRef);
        expect(docSnap.exists()).to.be.false;
      });
    });
  });

  describe('set', () => {
    it('can set a new document', () => {
      return withTestDoc(async docRef => {
        await setDoc(docRef, { val: 1 });
        const docSnap = await getDoc(docRef);
        expect(docSnap.data()).to.deep.equal({ val: 1 });
      });
    });

    it('can merge a document', () => {
      return withTestDocAndInitialData({ foo: 1 }, async docRef => {
        await setDoc(docRef, { bar: 2 }, { merge: true });
        const docSnap = await getDoc(docRef);
        expect(docSnap.data()).to.deep.equal({ foo: 1, bar: 2 });
      });
    });

    it('can merge a document with mergeFields', () => {
      return withTestDocAndInitialData({ foo: 1 }, async docRef => {
        await setDoc(
          docRef,
          { foo: 'ignored', bar: 2, baz: { foobar: 3 } },
          { mergeFields: ['bar', new FieldPath('baz', 'foobar')] }
        );
        const docSnap = await getDoc(docRef);
        expect(docSnap.data()).to.deep.equal({
          foo: 1,
          bar: 2,
          baz: { foobar: 3 }
        });
      });
    });

    it('throws when user input fails validation', () => {
      return withTestDoc(async docRef => {
        if (validationUsesPromises) {
          return expect(
            setDoc(docRef, { val: undefined })
          ).to.eventually.be.rejectedWith(
            /Function .* called with invalid data. Unsupported field value: undefined \(found in field val\)/
          );
        } else {
          expect(() => setDoc(docRef, { val: undefined })).to.throw(
            /Function .* called with invalid data. Unsupported field value: undefined \(found in field val\)/
          );
        }
      });
    });

    it("can ignore 'undefined'", () => {
      return withTestDbSettings(
        DEFAULT_PROJECT_ID,
        { ...DEFAULT_SETTINGS, ignoreUndefinedProperties: true },
        async db => {
          const docRef = doc(collection(db, 'test-collection'));
          await setDoc(docRef, { val: undefined });
          const docSnap = await getDoc(docRef);
          expect(docSnap.data()).to.deep.equal({});
        }
      );
    });
  });

  describe('update', () => {
    it('can update a document', () => {
      return withTestDocAndInitialData({ foo: 1, bar: 1 }, async docRef => {
        await updateDoc(docRef, { foo: 2, baz: 2 });
        const docSnap = await getDoc(docRef);
        expect(docSnap.data()).to.deep.equal({ foo: 2, bar: 1, baz: 2 });
      });
    });

    it('can update a document (using varargs)', () => {
      return withTestDocAndInitialData({ foo: 1, bar: 1 }, async docRef => {
        await updateDoc(docRef, 'foo', 2, new FieldPath('baz'), 2);
        const docSnap = await getDoc(docRef);
        expect(docSnap.data()).to.deep.equal({ foo: 2, bar: 1, baz: 2 });
      });
    });

    it('enforces that document exists', () => {
      return withTestDoc(async docRef => {
        await expect(updateDoc(docRef, { foo: 2, baz: 2 })).to.eventually.be
          .rejected;
      });
    });

    it('throws when user input fails validation', () => {
      return withTestDoc(async docRef => {
        if (validationUsesPromises) {
          return expect(
            updateDoc(docRef, { val: undefined })
          ).to.eventually.be.rejectedWith(
            /Function .* called with invalid data. Unsupported field value: undefined \(found in field val\)/
          );
        } else {
          expect(() => updateDoc(docRef, { val: undefined })).to.throw(
            /Function .* called with invalid data. Unsupported field value: undefined \(found in field val\)/
          );
        }
      });
    });
  });
}

describe('addDoc()', () => {
  it('can add a document', () => {
    return withTestCollection(async collRef => {
      const docRef = await addDoc(collRef, { val: 1 });
      const docSnap = await getDoc(docRef);
      expect(docSnap.data()).to.deep.equal({ val: 1 });
    });
  });

  it('throws when user input fails validation', () => {
    return withTestCollection(async collRef => {
      expect(() => addDoc(collRef, { val: undefined })).to.throw(
        'Function addDoc() called with invalid data. Unsupported field value: undefined (found in field val)'
      );
    });
  });
});

describe('DocumentSnapshot', () => {
  it('can represent missing data', () => {
    return withTestDoc(async docRef => {
      const docSnap = await getDoc(docRef);
      expect(docSnap.exists()).to.be.false;
      expect(docSnap.data()).to.be.undefined;
    });
  });

  it('can return data', () => {
    return withTestDocAndInitialData({ foo: 1 }, async docRef => {
      const docSnap = await getDoc(docRef);
      expect(docSnap.exists()).to.be.true;
      expect(docSnap.data()).to.deep.equal({ foo: 1 });
    });
  });

  it('can return single field', () => {
    return withTestDocAndInitialData({ foo: 1, bar: 2 }, async docRef => {
      const docSnap = await getDoc(docRef);
      expect(docSnap.get('foo')).to.equal(1);
      expect(docSnap.get(new FieldPath('bar'))).to.equal(2);
    });
  });

  it('can return nested field', () => {
    return withTestDocAndInitialData({ foo: { bar: 1 } }, async docRef => {
      const docSnap = await getDoc(docRef);
      expect(docSnap.get('foo.bar')).to.equal(1);
      expect(docSnap.get(new FieldPath('foo', 'bar'))).to.equal(1);
    });
  });

  it('is properly typed', () => {
    return withTestDocAndInitialData({ foo: 1 }, async docRef => {
      const docSnap = await getDoc(docRef);
      let documentData = docSnap.data()!; // "data" is typed as nullable
      if (docSnap.exists()) {
        documentData = docSnap.data(); // "data" is typed as non-null
      }
      expect(documentData).to.deep.equal({ foo: 1 });
    });
  });
});

describe('deleteDoc()', () => {
  it('can delete a non-existing document', () => {
    return withTestDoc(docRef => deleteDoc(docRef));
  });
});

describe('FieldValue', () => {
  it('support equality checking with isEqual()', () => {
    expectEqual(deleteField(), deleteField());
    expectEqual(serverTimestamp(), serverTimestamp());
    expectNotEqual(deleteField(), serverTimestamp());
  });

  it('support instanceof checks', () => {
    expect(deleteField()).to.be.an.instanceOf(FieldValue);
    expect(serverTimestamp()).to.be.an.instanceOf(FieldValue);
    expect(increment(1)).to.be.an.instanceOf(FieldValue);
    expect(arrayUnion('a')).to.be.an.instanceOf(FieldValue);
    expect(arrayRemove('a')).to.be.an.instanceOf(FieldValue);
  });

  it('can apply arrayUnion', () => {
    return withTestDocAndInitialData({ 'val': ['foo'] }, async docRef => {
      await updateDoc(docRef, 'val', arrayUnion('bar'));
      const snap = await getDoc(docRef);
      expect(snap.data()).to.deep.equal({ 'val': ['foo', 'bar'] });
    });
  });

  it('can apply arrayRemove', () => {
    return withTestDocAndInitialData(
      { 'val': ['foo', 'bar'] },
      async docRef => {
        await updateDoc(docRef, 'val', arrayRemove('bar'));
        const snap = await getDoc(docRef);
        expect(snap.data()).to.deep.equal({ 'val': ['foo'] });
      }
    );
  });

  it('can apply serverTimestamp', () => {
    return withTestDocAndInitialData({ 'val': null }, async docRef => {
      await updateDoc(docRef, 'val', serverTimestamp());
      const snap = await getDoc(docRef);
      expect(snap.get('val')).to.be.an.instanceOf(Timestamp);
    });
  });

  it('can delete field', () => {
    return withTestDocAndInitialData({ 'val': 'foo' }, async docRef => {
      await updateDoc(docRef, 'val', deleteField());
      const snap = await getDoc(docRef);
      expect(snap.data()).to.deep.equal({});
    });
  });
});

describe('Query', () => {
  function verifyResults(
    actual: firestore.QuerySnapshot<firestore.DocumentData>,
    ...expected: firestore.DocumentData[]
  ): void {
    expect(actual.empty).to.equal(expected.length === 0);
    expect(actual.size).to.equal(expected.length);

    for (let i = 0; i < expected.length; ++i) {
      expect(actual.docs[i].data()).to.deep.equal(expected[i]);
    }
  }

  it('supports default query', () => {
    return withTestCollectionAndInitialData([{ foo: 1 }], async collRef => {
      const result = await getQuery(collRef);
      verifyResults(result, { foo: 1 });
    });
  });

  it('supports empty results', () => {
    return withTestCollectionAndInitialData([], async collRef => {
      const result = await getQuery(collRef);
      verifyResults(result);
    });
  });

  it('supports filtered query', () => {
    return withTestCollectionAndInitialData(
      [{ foo: 1 }, { foo: 2 }],
      async collRef => {
        const query = collRef.where('foo', '==', 1);
        const result = await getQuery(query);
        verifyResults(result, { foo: 1 });
      }
    );
  });

  it('supports filtered query (with FieldPath)', () => {
    return withTestCollectionAndInitialData(
      [{ foo: 1 }, { foo: 2 }],
      async collRef => {
        const query = collRef.where(new FieldPath('foo'), '==', 1);
        const result = await getQuery(query);
        verifyResults(result, { foo: 1 });
      }
    );
  });

  it('supports ordered query (with default order)', () => {
    return withTestCollectionAndInitialData(
      [{ foo: 1 }, { foo: 2 }],
      async collRef => {
        const query = collRef.orderBy('foo');
        const result = await getQuery(query);
        verifyResults(result, { foo: 1 }, { foo: 2 });
      }
    );
  });

  it('supports ordered query (with asc)', () => {
    return withTestCollectionAndInitialData(
      [{ foo: 1 }, { foo: 2 }],
      async collRef => {
        const query = collRef.orderBy('foo', 'asc');
        const result = await getQuery(query);
        verifyResults(result, { foo: 1 }, { foo: 2 });
      }
    );
  });

  it('supports ordered query (with desc)', () => {
    return withTestCollectionAndInitialData(
      [{ foo: 1 }, { foo: 2 }],
      async collRef => {
        const query = collRef.orderBy('foo', 'desc');
        const result = await getQuery(query);
        verifyResults(result, { foo: 2 }, { foo: 1 });
      }
    );
  });

  it('supports limit query', () => {
    return withTestCollectionAndInitialData(
      [{ foo: 1 }, { foo: 2 }],
      async collRef => {
        const query = collRef.orderBy('foo').limit(1);
        const result = await getQuery(query);
        verifyResults(result, { foo: 1 });
      }
    );
  });

  it('supports limitToLast query', () => {
    return withTestCollectionAndInitialData(
      [{ foo: 1 }, { foo: 2 }, { foo: 3 }],
      async collRef => {
        const query = collRef.orderBy('foo').limitToLast(2);
        const result = await getQuery(query);
        verifyResults(result, { foo: 2 }, { foo: 3 });
      }
    );
  });

  it('supports startAt', () => {
    return withTestCollectionAndInitialData(
      [{ foo: 1 }, { foo: 2 }],
      async collRef => {
        const query = collRef.orderBy('foo').startAt(2);
        const result = await getQuery(query);
        verifyResults(result, { foo: 2 });
      }
    );
  });

  it('supports startAfter', () => {
    return withTestCollectionAndInitialData(
      [{ foo: 1 }, { foo: 2 }],
      async collRef => {
        const query = collRef.orderBy('foo').startAfter(1);
        const result = await getQuery(query);
        verifyResults(result, { foo: 2 });
      }
    );
  });

  it('supports endAt', () => {
    return withTestCollectionAndInitialData(
      [{ foo: 1 }, { foo: 2 }],
      async collRef => {
        const query = collRef.orderBy('foo').endAt(1);
        const result = await getQuery(query);
        verifyResults(result, { foo: 1 });
      }
    );
  });

  it('supports endBefore', () => {
    return withTestCollectionAndInitialData(
      [{ foo: 1 }, { foo: 2 }],
      async collRef => {
        const query = collRef.orderBy('foo').endBefore(2);
        const result = await getQuery(query);
        verifyResults(result, { foo: 1 });
      }
    );
  });

  it('supports pagination', () => {
    return withTestCollectionAndInitialData(
      [{ foo: 1 }, { foo: 2 }],
      async collRef => {
        let query = collRef.orderBy('foo').limit(1);
        let result = await getQuery(query);
        verifyResults(result, { foo: 1 });

        // Pass the document snapshot from the previous result
        query = query.startAfter(result.docs[0]);
        result = await getQuery(query);
        verifyResults(result, { foo: 2 });
      }
    );
  });

  it('supports collection groups', () => {
    return withTestCollection(async collRef => {
      const collectionGroupId = `${collRef.id}group`;

      const fooDoc = doc(
        collRef.firestore,
        `${collRef.id}/foo/${collectionGroupId}/doc1`
      );
      const barDoc = doc(
        collRef.firestore,
        `${collRef.id}/bar/baz/boo/${collectionGroupId}/doc2`
      );
      await setDoc(fooDoc, { foo: 1 });
      await setDoc(barDoc, { bar: 1 });

      const query = collectionGroup(collRef.firestore, collectionGroupId);
      const result = await getQuery(query);

      verifyResults(result, { bar: 1 }, { foo: 1 });
    });
  });

  it('validates collection groups', () => {
    return withTestDb(firestore => {
      expect(() => collectionGroup(firestore, '')).to.throw(
        'Function collectionGroup() requires its first argument to be of type non-empty string, but it was: ""'
      );
      expect(() => collectionGroup(firestore, '/')).to.throw(
        "Invalid collection ID '/' passed to function collectionGroup(). Collection IDs must not contain '/'."
      );
    });
  });
});

describe('equality', () => {
  it('for collection references', () => {
    return withTestDb(firestore => {
      const coll1a = collection(firestore, 'a');
      const coll1b = parent(doc(firestore, 'a/b'));
      const coll2 = collection(firestore, 'c');

      expect(refEqual(coll1a, coll1b)).to.be.true;
      expect(refEqual(coll1a, coll2)).to.be.false;

      const coll1c = collection(firestore, 'a').withConverter({
        toFirestore: data => data as firestore.DocumentData,
        fromFirestore: snap => snap.data()
      });
      expect(refEqual(coll1a, coll1c)).to.be.false;

      expect(refEqual(coll1a, doc(firestore, 'a/b'))).to.be.false;
    });
  });

  it('for document references', () => {
    return withTestDb(firestore => {
      const doc1a = doc(firestore, 'a/b');
      const doc1b = doc(collection(firestore, 'a'), 'b');
      const doc2 = doc(firestore, 'a/c');

      expect(refEqual(doc1a, doc1b)).to.be.true;
      expect(refEqual(doc1a, doc2)).to.be.false;

      const doc1c = collection(firestore, 'a').withConverter({
        toFirestore: data => data as firestore.DocumentData,
        fromFirestore: snap => snap.data()
      });
      expect(refEqual(doc1a, doc1c)).to.be.false;

      expect(refEqual(doc1a, collection(firestore, 'a'))).to.be.false;
    });
  });

  it('for queries', () => {
    return withTestCollectionAndInitialData(
      [{ foo: 1 }, { foo: 2 }],
      async collRef => {
        const query1a = collRef.orderBy('foo');
        const query1b = collRef.orderBy('foo', 'asc');
        const query2 = collRef.orderBy('foo', 'desc');
        // TODO(firestorelite): Should we allow `collectionRef(collRef, 'a/b')?
        const query3 = collection(doc(collRef, 'a'), 'b').orderBy('foo');

        expect(queryEqual(query1a, query1b)).to.be.true;
        expect(queryEqual(query1a, query2)).to.be.false;
        expect(queryEqual(query1a, query3)).to.be.false;
      }
    );
  });

  it('for query snapshots', () => {
    return withTestCollectionAndInitialData(
      [{ foo: 1 }, { foo: 2 }],
      async collRef => {
        const query1a = collRef.limit(10);
        const query1b = collRef.limit(10);
        const query2 = collRef.limit(100);

        const snap1a = await getQuery(query1a);
        const snap1b = await getQuery(query1b);
        const snap2 = await getQuery(query2);

        expect(snapshotEqual(snap1a, snap1b)).to.be.true;
        expect(snapshotEqual(snap1a, snap2)).to.be.false;

        // Re-run the query with an additional result.
        await addDoc(collRef, { foo: 3 });
        const snap1c = await getQuery(query1a);
        expect(snapshotEqual(snap1a, snap1c)).to.be.false;
      }
    );
  });

  it('for document snapshots', () => {
    return withTestCollectionAndInitialData(
      [{ foo: 1 }, { foo: 2 }],
      async collRef => {
        const snap1a = await getQuery(collRef);
        const snap1b = await getQuery(collRef);
        expect(snapshotEqual(snap1a.docs[0], snap1b.docs[0])).to.be.true;
        expect(snapshotEqual(snap1a.docs[0], snap1a.docs[0])).to.be.true;

        // Modify the document and obtain the snapshot again.
        await updateDoc(snap1a.docs[0].ref, { foo: 3 });
        const snap3 = await getQuery(collRef);
        expect(snapshotEqual(snap1a.docs[0], snap3.docs[0])).to.be.false;
      }
    );
  });
});

describe('withConverter() support', () => {
  class Post {
    constructor(readonly title: string, readonly author: string) {}
    byline(): string {
      return this.title + ', by ' + this.author;
    }
  }

  const postConverter = {
    toFirestore(post: Post): firestore.DocumentData {
      return { title: post.title, author: post.author };
    },
    fromFirestore(snapshot: firestore.QueryDocumentSnapshot): Post {
      const data = snapshot.data();
      return new Post(data.title, data.author);
    }
  };

  it('for DocumentReference.withConverter()', () => {
    return withTestDoc(async docRef => {
      docRef = docRef.withConverter(postConverter);
      await setDoc(docRef, new Post('post', 'author'));
      const postData = await getDoc(docRef);
      const post = postData.data();
      expect(post).to.not.equal(undefined);
      expect(post!.byline()).to.equal('post, by author');
    });
  });

  it('for CollectionReference.withConverter()', () => {
    return withTestCollection(async coll => {
      coll = coll.withConverter(postConverter);
      const docRef = await addDoc(coll, new Post('post', 'author'));
      const postData = await getDoc(docRef);
      const post = postData.data();
      expect(post).to.not.equal(undefined);
      expect(post!.byline()).to.equal('post, by author');
    });
  });

  it('for Query.withConverter()', () => {
    return withTestCollection(async coll => {
      coll = coll.withConverter(postConverter);
      await setDoc(doc(coll, 'post1'), new Post('post1', 'author1'));
      const posts = await getQuery(coll);
      expect(posts.size).to.equal(1);
      expect(posts.docs[0].data()!.byline()).to.equal('post1, by author1');
    });
  });

  it('drops the converter when calling parent() with a CollectionReference', () => {
    return withTestDb(async db => {
      const coll = collection(db, 'root/doc/parent').withConverter(
        postConverter
      );
      const untypedDoc = parent(coll)!;
      expect(refEqual(untypedDoc, doc(db, 'root/doc'))).to.be.true;
    });
  });

  it('checks converter when comparing with isEqual()', () => {
    return withTestDb(async db => {
      const postConverter2 = { ...postConverter };

      const postsCollection = collection(db, 'users/user1/posts').withConverter(
        postConverter
      );
      const postsCollection2 = collection(
        db,
        'users/user1/posts'
      ).withConverter(postConverter2);
      expect(refEqual(postsCollection, postsCollection2)).to.be.false;

      const docRef = doc(db, 'some/doc').withConverter(postConverter);
      const docRef2 = doc(db, 'some/doc').withConverter(postConverter2);
      expect(refEqual(docRef, docRef2)).to.be.false;
    });
  });
});
