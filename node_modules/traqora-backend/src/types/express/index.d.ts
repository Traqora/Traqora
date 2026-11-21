// Augment express request to include our custom user property

declare global {
    namespace Express {
        interface Request {
            user?: {
                walletAddress: string;
                walletType: string;
            };
        }
    }
}

// Emits an empty export to ensure it's treated as a module by TS
export { };
