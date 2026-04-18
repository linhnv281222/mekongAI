export function initializer(): () => Promise<unknown> {
  return (): Promise<unknown> => {
    return new Promise(async (resolve, reject) => {
      try {
        resolve(null);
      } catch (error) {
        reject(error);
      }
    });
  };
}
