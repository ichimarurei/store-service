enum DebitStatus {
    paid = 'paid',
    unpaid = 'unpaid',
    instalment = 'instalment'
}

enum Privilege {
    Admin = 'Admin',
    SuperAdmin = 'Super Admin'
}

const tempDir = 'temp';

const STOCK_STATE = { SYNC: 'sync:stock', SYNCING: 'syncing:stock', CACHED: 'cached:stock', TAKE: 'take:stock', STOP: 'stop:stock' };

const formatRp = (value = 0, discount = 0) => {
    let rpString = 'Rp 0';

    try {
        if (!isNaN(value)) {
            let final = value;

            if (discount > 0) {
                final = value - (discount / 100) * value;
            }

            rpString = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(final).replace(',00', '').replace('Rp', 'Rp ');
        } else {
            rpString = 'Rp 0.00';
        }
    } catch (_) {
        console.error(_);
    }

    return rpString;
};

export { DebitStatus, formatRp, Privilege, STOCK_STATE, tempDir };
