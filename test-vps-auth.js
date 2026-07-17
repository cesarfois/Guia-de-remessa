import { tokenManager } from './tokenManager.js';
import axios from 'axios';

const run = async () => {
    try {
        process.env.DOCUWARE_USERNAME = 'exportpbi@rcsangola.com';
        process.env.DOCUWARE_PASSWORD = 'Pbi@2026';
        process.env.DOCUWARE_ORG_ID = 'bcb91903-58eb-49c6-8572-be5e3bb9611e';

        console.log('Testing credentials...');
        const token = await tokenManager.loginWithServiceAccount();
        console.log('✅ Service Account Auth Success! Token:', token.substring(0, 15) + '...');
    } catch (error) {
        console.error('❌ Service Account Auth Failed:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
};

run();
