const isProd = import.meta.env.PROD;

/**
 * Safe logger that suppresses error details in production builds to avoid
 * leaking stack traces, user IDs, or database internals via browser DevTools.
 */
export const logger = {
  error: (message: string, error?: unknown) => {
    if (!isProd) {
      // eslint-disable-next-line no-console
      console.error(message, error);
    }
  },
  warn: (message: string, error?: unknown) => {
    if (!isProd) {
      // eslint-disable-next-line no-console
      console.warn(message, error);
    }
  },
};