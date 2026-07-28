// Augment express request to include our custom user property

declare global {
    namespace Express {
        interface Request {
            user?: {
                walletAddress: string;
                walletType: string;
            };
            admin?: {
                adminId: string;
                email: string;
            };
            tenantId?: string;
            tenantRole?: 'owner' | 'admin' | 'member' | 'viewer';
        }
    }
}

// Emits an empty export to ensure it's treated as a module by TS
export { };
