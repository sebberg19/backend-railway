
require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Servir les fichiers statiques depuis le dossier parent
app.use(express.static(path.join(__dirname, '..')));

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Route de test
app.get('/test', (req, res) => {
  res.json({ message: 'Backend fonctionne correctement!', timestamp: new Date().toISOString() });
});

app.post('/create-checkout-session', async (req, res) => {
  const { items, customer } = req.body;

  try {
    const line_items = items.map(item => ({
      price_data: {
        currency: 'cad',
        product_data: {
          name: item.name,
          description: item.description || '',
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
      metadata: {
        customer_data: JSON.stringify(customer),
        items_data: JSON.stringify(items)
      },
      success_url: 'https://futbolerovintageshop.netlify.app/success.html',
      cancel_url: 'https://futbolerovintageshop.netlify.app/cancel.html',
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(4242, () => console.log('Serveur Stripe en écoute sur le port 4242'));


const nodemailer = require('nodemailer');
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

app.post('/webhook', express.raw({ type: 'application/json' }), (request, response) => {
  const sig = request.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
  } catch (err) {
    console.error("Erreur de vérification webhook :", err.message);
    return response.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('🔍 Webhook reçu:', event.type);
  
  if (event.type === 'checkout.session.completed') {
    console.log('✅ Webhook reçu: checkout.session.completed');
    const session = event.data.object;
    console.log('📋 Session ID:', session.id);
    
    // Récupérer les données depuis les métadonnées
    let customerData = {};
    let itemsData = [];
    
    console.log('🔍 Métadonnées brutes:', session.metadata);
    
    try {
      if (session.metadata?.customer_data) {
        customerData = JSON.parse(session.metadata.customer_data);
        console.log('✅ Données client récupérées:', customerData);
      }
      if (session.metadata?.items_data) {
        itemsData = JSON.parse(session.metadata.items_data);
        console.log('✅ Données articles récupérées:', itemsData.length, 'articles');
      }
    } catch (parseError) {
      console.error("❌ Erreur parsing metadata:", parseError);
    }

    // Configurer le transporteur d'email
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'futbolerovintageshop@gmail.com',
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });

    // Créer le contenu HTML de l'email
    let itemsHtml = '';
    let total = 0;
    
    itemsData.forEach(item => {
      total += item.price * item.quantity;
      const imageHtml = item.image ? 
        `<img src="${item.image}" alt="Photo produit" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px;">` : 
        '<span style="color: #999;">Pas de photo</span>';
      
      itemsHtml += `
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${imageHtml}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${item.name}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${item.size || ''}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${item.playerName || ''}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${item.playerNumber || ''}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${item.quantity}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${item.price.toFixed(2)} CAD</td>
        </tr>
      `;
    });

    const emailHtml = `
      <h2 style="color: #198754;">🔔 Nouvelle commande Futbolero!</h2>
      
      <h3>📋 Informations client:</h3>
      <ul>
        <li><strong>Nom:</strong> ${customerData.nom || ''} ${customerData.prenom || ''}</li>
        <li><strong>Email:</strong> ${session.customer_email}</li>
        <li><strong>Téléphone:</strong> ${customerData.telephone || ''}</li>
        <li><strong>Adresse:</strong> ${customerData.adresse || ''}</li>
        <li><strong>Code postal:</strong> ${customerData.codepostal || ''}</li>
      </ul>

      <h3>🛍️ Articles commandés:</h3>
      <table style="border-collapse: collapse; width: 100%; margin: 10px 0;">
        <thead>
          <tr style="background-color: #f8f9fa;">
            <th style="padding: 10px; border: 1px solid #ddd;">Photo</th>
            <th style="padding: 10px; border: 1px solid #ddd;">Article</th>
            <th style="padding: 10px; border: 1px solid #ddd;">Taille</th>
            <th style="padding: 10px; border: 1px solid #ddd;">Nom</th>
            <th style="padding: 10px; border: 1px solid #ddd;">Numéro</th>
            <th style="padding: 10px; border: 1px solid #ddd;">Quantité</th>
            <th style="padding: 10px; border: 1px solid #ddd;">Prix</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <h3 style="color: #198754;">💰 Total: ${total.toFixed(2)} CAD</h3>

      <hr>
      <p><strong>Session ID:</strong> ${session.id}</p>
      <p><strong>Date:</strong> ${new Date().toLocaleString('fr-FR')}</p>
    `;

    const mailOptions = {
      from: 'futbolerovintageshop@gmail.com',
      to: 'futbolerovintageshop@gmail.com',
      subject: `🔔 Nouvelle commande Futbolero - ${customerData.nom || 'Client'} ${customerData.prenom || ''}`,
      html: emailHtml,
      text: `Nouvelle commande reçue de ${session.customer_email}. Total: ${total.toFixed(2)} CAD. Session: ${session.id}`
    };

    console.log('📤 Tentative d envoi d email...');
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('❌ Erreur envoi email:', error);
      } else {
        console.log('✅ Email envoye avec succes!');
        console.log('📬 ID du message:', info.messageId);
      }
    });
  }

  response.json({ received: true });
});
