import { jarvis } from '@/api/jarvisClient';

async function getCurrentUserOrThrow() {
  const currentUser = await jarvis.auth.me().catch(() => null);
  if (!currentUser?.email) throw new Error('AUTH_REQUIRED');
  return currentUser;
}

async function assertOwned(entityApi, id) {
  const currentUser = await getCurrentUserOrThrow();
  const record = await entityApi.get(id);
  if (!record) throw new Error('ENTITY_NOT_FOUND');
  if (record?.created_by !== currentUser.email) throw new Error('OWNER_MISMATCH');
  return { currentUser, record };
}

export async function updateOwnedEntity(entityApi, id, data) {
  await assertOwned(entityApi, id);
  return entityApi.update(id, data);
}

export async function deleteOwnedEntity(entityApi, id) {
  await assertOwned(entityApi, id);
  return entityApi.delete(id);
}