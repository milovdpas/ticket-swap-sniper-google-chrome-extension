import express, { Request, Response } from 'express';
import cors from 'cors';
import { snipeTickets } from './ticketswap-sniper';

const app = express();
app.use(cors());
app.use(express.json());

const router = express.Router();


router.post('/start', (req: Request, res: Response) => {
    const { eventUrl, maxPrice, minTickets, maxTickets, token } = req.body;
    if (!eventUrl) {
        res.status(400).json({ error: "Missing eventUrl" });
        return;
    }

    res.json({ message: "Sniping started" });

    // Run sniping process asynchronously
    setImmediate(() => {
        try {
            snipeTickets(
                eventUrl,
                parseFloat(maxPrice),
                parseInt(minTickets),
                parseInt(maxTickets),
                token
            );
        } catch (err: any) {
            console.error("Sniping failed:", err.message);
        }
    });
});

app.use('/', router);

app.listen(3000, () => {
    console.log('🚀 Sniper control server running on http://localhost:3000');
});
