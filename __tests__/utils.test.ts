import { sortWalletsByTokenBalance } from '../components/utils';

describe('sortWalletsByTokenBalance', () => {
    const mockWallets = [
        { tokenBalance: 100 },
        { tokenBalance: 50 },
        { tokenBalance: 200 },
        { tokenBalance: 150 },
    ];

    test('sorts wallets in descending order by default', () => {
        const sorted = sortWalletsByTokenBalance(mockWallets, false);
        expect(sorted).toEqual([
            { tokenBalance: 200 },
            { tokenBalance: 150 },
            { tokenBalance: 100 },
            { tokenBalance: 50 },
        ]);
    });

    test('sorts wallets in ascending order when asc is true', () => {
        const sorted = sortWalletsByTokenBalance(mockWallets, true);
        expect(sorted).toEqual([
            { tokenBalance: 50 },
            { tokenBalance: 100 },
            { tokenBalance: 150 },
            { tokenBalance: 200 },
        ]);
    });

    test('handles empty array', () => {
        const sorted = sortWalletsByTokenBalance([]);
        expect(sorted).toEqual([]);
    });

    test('handles array with one wallet', () => {
        const singleWallet = [{ tokenBalance: 100 }];
        const sorted = sortWalletsByTokenBalance(singleWallet);
        expect(sorted).toEqual(singleWallet);
    });

});
