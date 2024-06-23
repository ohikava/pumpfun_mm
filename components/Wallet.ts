export class Wallet {
    private privateKey: string;

    constructor(privateKey: string) {
        this.privateKey = privateKey;
    }

    public buy(): void {
        // Implement buying logic here
    }

    // Empty method for selling assets
    public sell(): void {
        // Implement selling logic here
    }

    // Method to get the private key (for demonstration purposes, usually you'd keep this private)
    public getPrivateKey(): string {
        return this.privateKey;
    }
}
