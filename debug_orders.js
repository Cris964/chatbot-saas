const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkOrders() {
    console.log('--- Checking Orders Table ---');
    try {
        const { data: orders, error } = await supabase.from('orders').select('*').limit(1);
        if (error) {
            console.error('Error fetching orders:', error.message);
        } else {
            console.log('Sample order:', orders);
            if (orders && orders.length > 0) {
                console.log('Columns in orders:', Object.keys(orders[0]));
            } else {
                console.log('Orders table is EMPTY or no columns found.');
            }
        }
    } catch (e) {
        console.error('Exception checking orders:', e.message);
    }

    console.log('\n--- Checking Inventory for CX-P ---');
    try {
        const { data: products, error: prodError } = await supabase
            .from('inventory')
            .select('*')
            .ilike('name', '%CX-P%');
        
        if (prodError) {
            console.error('Error fetching products:', prodError.message);
        } else {
            console.log('Found products matching CX-P:', products);
        }
    } catch (e) {
        console.error('Exception checking inventory:', e.message);
    }
}

checkOrders();
