export async function signOutSafely(signOut: () => Promise<{ error: unknown | null }>) {
  try {
    const { error } = await signOut();
    return error == null;
  } catch {
    return false;
  }
}
