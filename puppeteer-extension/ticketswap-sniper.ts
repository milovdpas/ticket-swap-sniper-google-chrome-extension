import { Page, Browser } from "puppeteer";
import notifier from 'node-notifier';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import open from 'open';
import sound from 'sound-play';
import path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();
puppeteer.use(StealthPlugin());

// ENV CONFIG
const MAX_PRICE = parseFloat(process.env.MAX_PRICE || '50');
const MIN_TICKETS = parseInt(process.env.MIN_TICKETS || '1');
const PROXIES = (process.env.PROXIES || '').split(',').map(p => p.trim());
const proxyUsername = process.env.PROXY_USERNAME || 'test';
const proxyPassword = process.env.PROXY_PASSWORD || 'test';

// UTILS
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
const REFRESH_INTERVAL_MS = () => Math.floor(Math.random() * 3000) + 4000;
const getRandomProxy = (): string => PROXIES[Math.floor(Math.random() * PROXIES.length)];

async function setupPageWithProxy(browser: Browser): Promise<Page> {
    const page = await browser.newPage();
    await page.authenticate({ username: proxyUsername, password: proxyPassword });
    return page;
}

async function simulateHumanVerification(page: Page) {
    console.log('⚠️ Verification required...');
    while (true) {
        const button = await page.$('#b');
        if (!button) break;

        const coords = await page.evaluate(() => {
            const btn = document.getElementById('b');
            if (!btn) return null;
            const rect = btn.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }).catch(err => {
            console.error('⚠️ Verification check failed:', err.message);
            return null;
        });

        if (!coords) break;
        console.log(`🖱 Clicking at (${coords.x}, ${coords.y})`);
        try {
            await humanClick(page, coords.x, coords.y);
        } catch (e) {
            console.error('Mouse click failed:', e);
        }

        await delay(Math.floor(Math.random() * 250) + 500);
    }
}

async function humanClick(page: Page, x: number, y: number) {
    const steps = 25;
    const delayMs = 10 + Math.random() * 15;
    const start = { x: Math.random() * 800, y: Math.random() * 600 };
    const dx = (x - start.x) / steps;
    const dy = (y - start.y) / steps;

    for (let i = 0; i <= steps; i++) {
        await page.mouse.move(start.x + dx * i, start.y + dy * i);
        await delay(delayMs);
    }

    await page.mouse.down();
    await delay(50 + Math.random() * 100);
    await page.mouse.up();
}

async function extractTicketOffers(page: Page) {
    try {
        return await page.evaluate(() => {
            const listings: { url: string, price: number, count: number }[] = [];
            const header = [...document.querySelectorAll("h3.styles_h3__fj7M_")]
                .find(h => h.textContent?.trim().toLowerCase() === "beschikbare tickets");
            if (!header) return listings;

            const container = header.parentElement?.children[1];
            if (!container) return listings;

            const offerElements = container.querySelectorAll('a[href*="/listing/"]');
            offerElements.forEach(el => {
                if (!(el instanceof HTMLAnchorElement)) return;

                const title = el.querySelector('h4')?.textContent || '';
                const match = title.match(/(\d+)\s+tickets?/i);
                const count = match ? parseInt(match[1]) : 0;

                const priceText = el.querySelector('strong')?.textContent || '';
                const price = parseFloat(priceText.replace(/[^\d,.-]/g, '').replace(',', '.'));

                listings.push({ url: el.href, price, count });
            });

            return listings;
        });
    } catch (error: any) {
        console.error("⚠️ extractTicketOffers failed:", error.message);
        return [];
    }
}

async function notifyUserTicketFound(price: number, count: number){
    await sound.play(path.join(__dirname, 'ping.mp3'));
    notifier.notify({
        title: '🎫 Ticket Found!',
        message: `A ticket is available for €${price} (${count} tickets)`,
        icon: path.join(__dirname, 'logo.png'), // optional
        sound: true, // plays default system sound
        wait: false
    });
    console.log("🔊 Notification sent.");
}

async function tryClickBuyButton(page: Page): Promise<boolean> {
    const buttons = await page.$$('button');
    for (const button of buttons) {
        const text = await page.evaluate(el => el.textContent?.trim().toLowerCase(), button);
        if (text?.includes("in winkelwagen")) {
            console.log("✅ Clicking 'In winkelwagen'...");
            await button.click();
            await delay(2000);
            return true;
        }
    }
    console.warn("⚠️ Buy button not found.");
    return false;
}

async function handleListing(page: Page, url: string, token: string, maxTickets: number): Promise<boolean> {
    await page.browserContext().setCookie({
        name: "token",
        value: token,
        domain: ".ticketswap.nl",
        path: "/",
        httpOnly: false,
        secure: true,
        sameSite: "Lax",
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await delay(750);

    const isPackage = await page.evaluate(() =>
        document.body.innerText.includes("Deze tickets worden alleen samen verkocht")
    ).catch(() => false);

    const isTaken = await page.evaluate(() =>
        document.body.innerText.includes("Iemand anders is deze tickets al aan het kopen")
    ).catch(() => false);

    if (isTaken) {
        console.log("❌ Ticket is being purchased by someone else.");
        return false;
    }

    if (isPackage) {
        const count = await page.evaluate(() => {
            const h2 = document.querySelector('h2');
            if (!h2) return 0;
            const match = h2.innerText.match(/(\d+)\s+tickets?/i);
            return match ? parseInt(match[1]) : 0;
        }).catch(() => 0);

        if (count > maxTickets) {
            console.log(`❌ Too many tickets in package: ${count} > ${maxTickets}`);
            return false;
        }
    }

    return await tryClickBuyButton(page);
}

// MAIN FUNCTION
export async function snipeTickets(
    eventUrl: string,
    maxPrice = MAX_PRICE,
    minTickets = MIN_TICKETS,
    maxTickets: number,
    token: string
): Promise<void> {
    console.log('🎯 Starting TicketSwap Sniper...');
    let attempt = 1;

    while (true) {
        const proxy = getRandomProxy();
        console.log(`🔁 Attempt ${attempt} | Using proxy: ${proxy}`);

        const browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            args: ['--start-maximized', `--proxy-server=${proxy}`],
            // @ts-ignore
            ignoreHTTPSErrors: true,
        });

        try {
            const page = await setupPageWithProxy(browser);
            await page.goto(eventUrl, { waitUntil: 'networkidle2', timeout: 60000 });

            const html = await page.content();
            if (/Let's make sure you're real/i.test(html)) {
                await simulateHumanVerification(page);
            }

            await delay(1250);
            const offers = await extractTicketOffers(page);
            const validOffers = offers.filter(o => o.price <= maxPrice && o.count >= minTickets);

            if (validOffers.length > 0) {
                const best = validOffers.reduce((a, b) => a.price < b.price ? a : b);
                console.log(`🎉 Found: €${best.price}, ${best.count} tickets → ${best.url}`);

                notifyUserTicketFound(best.price, best.count);

                const listingPage = await setupPageWithProxy(browser);
                const success = await handleListing(listingPage, best.url, token, maxTickets);

                if (success) {
                    await open("https://www.ticketswap.nl/checkout/summary");
                }

                await browser.close();
                break;
            } else {
                console.log('🕵️ No matching tickets found. Retrying...');
            }

            await delay(REFRESH_INTERVAL_MS());
            await browser.close();
            attempt++;

        } catch (error: any) {
            console.error(`⚠️ Error with proxy ${proxy}:`, error.message);
            await browser.close();
            attempt++;
        }
    }
}
