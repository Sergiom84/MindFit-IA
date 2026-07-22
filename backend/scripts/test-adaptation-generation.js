import pool from '../db.js';
import { generateFullBodySessions } from '../services/hipertrofia/adaptation/fullBodyGenerator.js';
import { generateHalfBodySessions } from '../services/hipertrofia/adaptation/halfBodyGenerator.js';

async function testAdaptation() {
    console.log('🧪 Testing Adaptation Generation...');
    const client = await pool.connect();

    try {
        // Test Full Body - 1 Week (4 Days)
        console.log('\n--- Testing Full Body (1 Week) ---');
        const fb1 = await generateFullBodySessions(client, 1);
        console.log(`Generated ${fb1.length} sessions.`);
        fb1.forEach(s => console.log(`  Week ${s.week} Day ${s.dayOfWeek} (${s.dayName}): ${s.exercises.length} exercises`));

        // Test Full Body - 3 Weeks (3 Days)
        console.log('\n--- Testing Full Body (3 Weeks) ---');
        const fb3 = await generateFullBodySessions(client, 3);
        console.log(`Generated ${fb3.length} sessions.`);
        // Print first week only to save space
        fb3.filter(s => s.week === 1).forEach(s => console.log(`  Week ${s.week} Day ${s.dayOfWeek} (${s.dayName}): ${s.exercises.length} exercises`));

        // Test Half Body - 2 Weeks (5 Days)
        console.log('\n--- Testing Half Body (2 Weeks) ---');
        const hb = await generateHalfBodySessions(client, 2);
        console.log(`Generated ${hb.length} sessions.`);
        hb.filter(s => s.week === 1).forEach(s => console.log(`  Week ${s.week} Day ${s.dayOfWeek} (${s.dayName}): ${s.name}`));

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        client.release();
        pool.end();
    }
}

testAdaptation();
