export const Logger = (controllerName: string, error: unknown): void => {
  const timestamp = new Date().toISOString();

  if (error instanceof Error) {
    console.error(`[${timestamp}] ❌ Error in ${controllerName} - ${error.message}`);
    console.error(error.stack);
  } else {
    console.error(`[${timestamp}] ❌ Error in ${controllerName} - ${JSON.stringify(error)}`);
  }
};