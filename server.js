require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4242;

// Middleware
app.use(express.json());
app.use(cors({
  origin: ['https://futbolerovintageshop.netlify.app', 'http://localhost:3000', 'http://localhost:4242'],
  credentials: true
}));

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Route de test
app.get('/', (req, res) => {
  res.json({ message: 'Backend Futbolero en ligne!', timestamp: new Date().toISOString() });
});

app.get('/test', (req, res) => {
  res.json({ message: 'Backend fonctionne correctement!', timestamp: new Date().toISOString() });
});

// Route principale Stripe
app.post('/create-checkout-session', async (req, res) => {
  const { items, customer } = req.body;

  try {
    const line_items = items.map(item => ({
      price_data: {
        currency: 'cad',
        product_data: {
          name: item.name,
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: line_items,
      mode: 'payment',
      customer_email: customer.email,
      success_url: 'https://futbolerovintageshop.netlify.app/success.html',
      cancel_url: 'https://futbolerovintageshop.netlify.app/checkout.html',
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Erreur Stripe:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Serveur backend en écoute sur le port ${PORT}`);
});
