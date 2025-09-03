import { FastifyRedis } from '@fastify/redis';
import dayjs from 'dayjs';
import 'dayjs/locale/id';
import { first, forOwn, isEmpty, last, reverse, round } from 'lodash';
import { DocumentScope } from 'nano';
import handshakeArchiveDB from '../couchdb';
import debitSchema, { DebitDocument } from '../models/debit.schema';
import productSchema, { ProductDocument } from '../models/product.schema';
import receiptSchema, { ReceiptDocument } from '../models/receipt.schema';
import salesSchema, { SalesDocument } from '../models/sales.schema';
import handshakeDB from '../mongo';
import { processAnalytics } from './analytics';
import { DebitStatus, formatRp, STOCK_STATE } from './global';
import { cleansing } from './sync';

dayjs.locale('id');

const _getProducts = async () =>
    await productSchema
        .find()
        .select('-__v')
        .sort({ name: 'asc', 'author.edited.time': 'desc', 'author.created.time': 'desc' })
        .populate({ path: 'category', select: '-__v' })
        .populate({ path: 'unit', select: '-__v' })
        .populate({ path: 'bundle.node.unit', select: '-__v' })
        .populate({ path: 'bundle.contain.unit', select: '-__v' })
        .populate({ path: 'author.created.by', select: '-__v' })
        .populate({ path: 'author.edited.by', select: '-__v' })
        .populate({ path: 'author.deleted.by', select: '-__v' })
        .lean<ProductDocument[]>();

const _getReceipts = async () => {
    const items = await receiptSchema
        .find()
        .select('-__v')
        .sort({ date: 'desc', 'author.edited.time': 'desc', 'author.created.time': 'desc' })
        .populate({
            path: 'products.product',
            select: '-__v -author',
            populate: [
                { path: 'category', select: '-__v' },
                { path: 'unit', select: '-__v' },
                { path: 'bundle.node.unit', select: '-__v' },
                { path: 'bundle.contain.unit', select: '-__v' }
            ]
        })
        .populate({ path: 'products.unit', select: '-__v' })
        .populate({ path: 'supplier', select: '-__v' })
        .populate({ path: 'author.created.by', select: '-__v' })
        .populate({ path: 'author.edited.by', select: '-__v' })
        .populate({ path: 'author.deleted.by', select: '-__v' })
        .lean<ReceiptDocument[]>();

    // Filter out products where product population failed (is null)
    return items.map((item) => ({ ...item, products: item.products.filter(({ product }) => product !== null) }));
};

const _getSales = async () => {
    const items = await salesSchema
        .find()
        .select('-__v')
        .sort({ date: 'desc', 'author.edited.time': 'desc', 'author.created.time': 'desc' })
        .populate({
            path: 'products.product',
            select: '-__v -author',
            populate: [
                { path: 'category', select: '-__v' },
                { path: 'unit', select: '-__v' },
                { path: 'bundle.node.unit', select: '-__v' },
                { path: 'bundle.contain.unit', select: '-__v' }
            ]
        })
        .populate({ path: 'products.salesQty.unit', select: '-__v' })
        .populate({ path: 'products.bonusQty.unit', select: '-__v' })
        .populate({ path: 'customer', select: '-__v' })
        .populate({ path: 'author.created.by', select: '-__v' })
        .populate({ path: 'author.edited.by', select: '-__v' })
        .populate({ path: 'author.deleted.by', select: '-__v' })
        .lean<SalesDocument[]>();

    // Filter out products where product population failed (is null)
    return items.map((item) => ({
        ...item,
        products: item.products.filter(({ product }) => product !== null)
    }));
};

const _getHasPaid = async () =>
    await debitSchema
        .find({ status: DebitStatus.paid })
        .select('-__v')
        .sort({ date: 'desc', 'author.edited.time': 'desc', 'author.created.time': 'desc' })
        .populate({ path: 'debt.supplier', select: '-__v' })
        .populate({ path: 'loan.customer', select: '-__v' })
        .populate({ path: 'author.created.by', select: '-__v' })
        .populate({ path: 'author.edited.by', select: '-__v' })
        .populate({ path: 'author.deleted.by', select: '-__v' })
        .lean<DebitDocument[]>();

const _prepareStockTaking = async () => {
    let products: any[] = [];
    let receipts: any[] = [];
    let sales: any[] = [];
    let hasPaid: any[] = [];

    try {
        await handshakeDB();
        console.info('Fetch products | stock taking ...');
        products = await _getProducts();
        console.info('Fetch receipt | stock taking ...');
        receipts = await _getReceipts();
        console.info('Fetch sales | stock taking ...');
        sales = await _getSales();
        console.info('Fetch has paid | stock taking ...');
        hasPaid = await _getHasPaid();
    } catch (error) {
        console.error(error);
    }

    return { products, receipts, sales, hasPaid };
};

const _takingProducts = async (couchdb: DocumentScope<any>, products: any[], model: string, period: string) => {
    let counter = 0;
    let saved = 0;

    console.info('Archiving products ...');
    for (const product of products) {
        let inventory = product?.inventory ?? 0;
        const category = product?.category ?? null;
        const unit = product?.unit ?? null;
        const bundle = product?.bundle ?? null;
        const author = product.author;
        delete category?._id;
        delete unit?._id;
        delete bundle?.node?.unit?._id;
        delete bundle?.contain?.unit?._id;
        delete author.created?.by?._id;
        delete author.edited?.by?._id;
        delete author.deleted?.by?._id;

        if (inventory < 0) {
            inventory = 0;
        }

        const inserted = await couchdb.insert({ logged: new Date(), id: String(product?._id), name: product?.name, initialCost: product?.initialCost, cost: product?.cost ?? [0, 0], inventory, bundle, category, unit, author, period, model });
        counter++;

        if (inserted.ok) {
            console.info('Done archiving product :', counter, ' of ', products.length);
            saved++;
        }
    }
    console.info('Archiving products done');

    return products.length === saved;
};

const _takingReceipts = async (couchdb: DocumentScope<any>, receipts: any[], model: string, period: string) => {
    let counter = 0;
    let saved = 0;

    console.info('Archiving receipts ...');
    for (const receipt of receipts) {
        const supplier = receipt?.supplier ?? null;
        const author = receipt.author;
        delete supplier?._id;
        delete author.created?.by?._id;
        delete author.edited?.by?._id;
        delete author.deleted?.by?._id;

        const products = (receipt.products as any[]).map(({ product, unit, qty, cost, discount }) => {
            delete product?._id;
            delete product?.category?._id;
            delete product?.unit?._id;
            delete unit?._id;

            return { product, unit, qty, cost, discount };
        });

        const inserted = await couchdb.insert({ logged: new Date(), id: String(receipt?._id), reference: receipt?.reference, date: receipt?.date ?? null, supplier, products, author, period, model });
        counter++;

        if (inserted.ok) {
            console.info('Done archiving receipt :', counter, ' of ', receipts.length);
            saved++;
        }
    }
    console.info('Archiving receipts done');

    return receipts.length === saved;
};

const _takingSales = async (couchdb: DocumentScope<any>, sales: any[], model: string, period: string) => {
    let counter = 0;
    let saved = 0;

    console.info('Archiving sales ...');
    for (const sale of sales) {
        const customer = sale?.customer ?? null;
        const author = sale.author;
        delete customer?._id;
        delete author.created?.by?._id;
        delete author.edited?.by?._id;
        delete author.deleted?.by?._id;

        const products = (sale.products as any[]).map(({ product, salesQty, bonusQty, price, discount }) => {
            delete product?._id;
            delete product?.category?._id;
            delete product?.unit?._id;
            delete salesQty?.unit?._id;
            delete bonusQty?.unit?._id;

            return { product, salesQty, bonusQty, price, discount };
        });

        const inserted = await couchdb.insert({
            logged: new Date(),
            id: String(sale?._id),
            reference: sale?.reference,
            subPrice: sale?.subPrice,
            finalPrice: sale?.finalPrice,
            paid: sale?.paid,
            change: sale?.change ?? 0,
            tax: sale?.tax ?? 0,
            date: sale?.date ?? null,
            customer,
            products,
            author,
            period,
            model
        });
        counter++;

        if (inserted.ok) {
            console.info('Done archiving sales :', counter, ' of ', sales.length);
            saved++;
        }
    }
    console.info('Archiving sales done');

    return sales.length === saved;
};

const _takingPaid = async (couchdb: DocumentScope<any>, hasPaid: any[], model: string, period: string) => {
    let counter = 0;
    let saved = 0;

    console.info('Archiving has paid ...');
    for (const paid of hasPaid) {
        const debt = paid?.debt ?? null;
        const loan = paid?.loan ?? null;
        const author = paid.author;
        delete debt?.supplier?._id;
        delete loan?.customer?._id;
        delete author.created?.by?._id;
        delete author.edited?.by?._id;
        delete author.deleted?.by?._id;

        const inserted = await couchdb.insert({
            logged: new Date(),
            id: String(paid?._id),
            money: paid?.money,
            status: paid?.status,
            instalment: paid?.instalment,
            date: paid?.date ?? null,
            debt,
            loan,
            author,
            period,
            model
        });
        counter++;

        if (inserted.ok) {
            console.info('Done archiving has paid :', counter, ' of ', hasPaid.length);
            saved++;
        }
    }
    console.info('Archiving has paid done');

    return hasPaid.length === saved;
};

const _calculateSumCost = (products: any[]) => {
    let sumCost = 0;

    products.forEach((item) => {
        let amount = item?.cost ?? item?.price ?? 0;

        if (item?.discount > 0) {
            amount = amount - (item?.discount / 100) * amount;
        }

        sumCost += amount;
    });

    return sumCost;
};

const _calculateDataSheetMonthly = (sales: any[], loans: any[]) => {
    const monthly: any = {};
    const labels: string[] = [];
    const tables: any[] = [];
    const salesReversed = reverse(sales);
    const firstKey = first(salesReversed)?.date ?? first(salesReversed)?.author.created?.time;
    const lastKey = last(salesReversed)?.date ?? last(salesReversed)?.author.created?.time;
    const datasets: any[] = [
        {
            label: 'Pendapatan',
            data: [],
            fill: false,
            backgroundColor: '#2f4860',
            borderColor: '#2f4860',
            tension: 0.4
        },
        {
            label: 'Kas',
            data: [],
            fill: false,
            backgroundColor: '#00bb7e',
            borderColor: '#00bb7e',
            tension: 0.4
        }
    ];

    if (firstKey && lastKey) {
        let checkKey = dayjs(firstKey);

        while (checkKey.isBefore(dayjs(lastKey), 'month') || checkKey.isSame(dayjs(lastKey), 'month')) {
            monthly[dayjs(checkKey).format('YYYY-MM')] = [];
            checkKey = checkKey.add(1, 'month');
        }
    }

    salesReversed.forEach(({ date, author, finalPrice, subPrice, reference }) => {
        const datetime = date ?? author.created?.time ?? null;

        if (datetime) {
            let loan = 0;
            const monthTag = dayjs(datetime).format('YYYY-MM');
            const dataLoan = loans.find(({ loan, status }) => loan?.reference === reference && status !== DebitStatus.paid);

            if (monthly?.[monthTag]) {
                if (dataLoan) {
                    loan = dataLoan?.money ?? 0;

                    ((dataLoan?.instalment as any[]) ?? []).forEach(({ money }) => {
                        loan -= money;
                    });
                }

                monthly[monthTag].push({ period: dayjs(datetime).format('MMM YYYY'), income: finalPrice, revenue: subPrice - loan, nett: subPrice, loan });
            }
        }
    });

    forOwn(monthly, (values, key) => {
        if (isEmpty(values)) {
            monthly[key] = [{ period: dayjs(`${key}-01`).format('MMM YYYY'), income: 0, revenue: 0, nett: 0, loan: 0 }];
        }
    });

    forOwn(monthly, (values, at) => {
        let income = 0;
        let revenue = 0;
        let nett = 0;
        let loan = 0;

        (values as any[]).forEach((value) => {
            if (!labels.includes(value?.period)) {
                labels.push(value?.period);
            }

            income += value?.income;
            revenue += value?.revenue;
            nett += value?.nett;
            loan += value?.loan;
        });

        datasets[0].data.push(income);
        datasets[1].data.push(revenue);
        tables.push({ period: dayjs(`${at}-01`).format('MMM YYYY'), income: formatRp(income), revenue: formatRp(revenue), nett: formatRp(nett), loan: formatRp(loan) });
    });

    return { labels, datasets, tables: reverse(tables) };
};

const _countBuys = (list: any[]) => {
    let cost = 0;

    list.forEach(({ products }: any) => {
        cost += _calculateSumCost(products);
    });

    return round(cost);
};

const _countSells = (list: any[]) => {
    let revenue = 0;
    let tax = 0;

    list.forEach(({ subPrice, finalPrice }: any) => {
        revenue += subPrice;
        tax += finalPrice - subPrice;
    });

    return { revenue, tax: { count: list.filter(({ tax }) => tax > 0).length, amount: tax } };
};

const _countDebts = (list: any[]) => {
    let sumDebt = 0;
    let sumLoan = 0;

    list.forEach(({ money, debt, loan }) => {
        if (debt) {
            sumDebt += money;
        }

        if (loan) {
            sumLoan += money;
        }
    });

    return { debt: sumDebt, loan: sumLoan };
};

const stockTaking = async (redis: FastifyRedis) => {
    const archiveDb = await handshakeArchiveDB();
    const period = dayjs().format('MMM-YYYY');
    let done = false;

    if (archiveDb) {
        const { products, receipts, sales, hasPaid } = await _prepareStockTaking();
        const productArchived = await _takingProducts(archiveDb, products, 'products', period);
        const receiptArchived = await _takingReceipts(archiveDb, receipts, 'receipts', period);
        const salesArchived = await _takingSales(archiveDb, sales, 'sales', period);
        const paidArchived = await _takingPaid(archiveDb, hasPaid, 'debts', period);
        done = productArchived && receiptArchived && salesArchived && paidArchived;

        if (done) {
            console.info('Resetting inventory ...');
            const taken = await archiveDb.find({ selector: { period, model: 'period' }, limit: 1 });

            if (isEmpty(taken.docs)) {
                await archiveDb.insert({ period, model: 'period', logged: new Date() });
            }

            console.info('Processing analytics result ...');
            const analytics = await processAnalytics(redis);
            console.info('Saving analytics result ...');
            await archiveDb.insert({
                period,
                model: 'sum',
                logged: new Date(),
                products: products.length,
                receipts: receipts.length,
                sales: sales.length,
                debts: hasPaid.length,
                amount: {
                    receipts: _countBuys(receipts),
                    sales: _countSells(sales),
                    debts: { amount: _countDebts(hasPaid), count: { debt: hasPaid.filter(({ debt }) => debt !== null).length, loan: hasPaid.filter(({ loan }) => loan !== null).length } }
                },
                analytics: {
                    result: _calculateDataSheetMonthly(analytics?.records?.sales?.all ?? [], analytics?.records?.loans ?? []),
                    top: { product: analytics?.records?.highest?.products ?? [], customer: analytics?.records?.highest?.customers ?? [], category: analytics?.records?.highest?.categories ?? [] }
                }
            });
            await cleansing(
                redis,
                products.map((item) => ({ product: item?._id, cost: (item?.cost as any[])?.at(1) ?? (item?.cost as any[])?.at(0) ?? item?.initialCost ?? 0, inventory: item?.inventory ?? 0 }))
            );
            await redis.del(STOCK_STATE.CACHED, 'analytics');
        }

        console.info('Stock taking done', done);
    }

    return done;
};

export default stockTaking;
