import liff from '@line/liff';

const LIFF_ID = import.meta.env.VITE_LIFF_ID;;

export const initLiff = async () => {
  try {
    await liff.init({ liffId: LIFF_ID });
    return liff;
  } catch (error) {
    console.error('LIFF 初始化失敗', error);
    throw error;
  }
};

export default liff;