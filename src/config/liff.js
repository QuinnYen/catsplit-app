import liff from '@line/liff';

const LIFF_ID = import.meta.env.VITE_LIFF_ID;

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`LIFF init timeout after ${ms}ms`)), ms)),
  ])

export const initLiff = async () => {
  await withTimeout(liff.init({ liffId: LIFF_ID }), 5000);
  return liff;
};

export default liff;