import 'reflect-metadata'; // Must be the first import
import express, { Request, Response } from 'express';
import { AppDataSource } from './data-source';
import { Contact } from './entities/Contact'; // We'll use this later
import * as dotenv from 'dotenv';
import { ContactService } from './services/ContactService'; // Import the service

dotenv.config();

const app = express();
const PORT = process.env.APP_PORT || 3000;

app.use(express.json());

AppDataSource.initialize()
    .then(() => {
        console.log('Data Source has been initialized!');

        const contactService = new ContactService(); // Instantiate the service

        app.get('/', (req: Request, res: Response) => {
            res.send('Identity Reconciliation Service with TypeORM is running!');
        });

        app.post('/identify', async (req: Request, res: Response) => {
            const { email, phoneNumber } = req.body;

            if (phoneNumber && typeof phoneNumber !== 'string') {
                // As per spec, phoneNumber might come as number, TypeORM expects string.
                req.body.phoneNumber = String(phoneNumber);
            }

            try {
                const result = await contactService.identifyContact(req.body);
                res.status(200).json(result);
            } catch (error: any) {
                console.error('Error in /identify:', error);
                // Differentiate between client errors (e.g., bad input) and server errors
                if (error.message === 'Email or phone number must be provided.') {
                    res.status(400).json({ error: error.message });
                } else {
                    res.status(500).json({ error: 'Internal Server Error' });
                }
            }
        });

        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error('Error during Data Source initialization:', err);
    }); 