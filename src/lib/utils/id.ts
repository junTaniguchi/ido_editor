export const createId = (prefix = 'id'): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // フォールバックへ
    }
  }

  const random = Math.random().toString(16).slice(2);
  return `${prefix}_${Date.now()}_${random}`;
};
