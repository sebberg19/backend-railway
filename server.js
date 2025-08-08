
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
      success_url: 'https://futbolerovintageshop.netlify.app/success-auto-email.html',
      cancel_url: 'https://futbolerovintageshop.netlify.app/cancel.html',
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(4242, () => console.log('Serveur Stripe en écoute sur le port 4242'));

const PORT = process.env.PORT || 4242;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`📧 Email configuré avec: futbolerovintageshop@gmail.com`);
  console.log(`🔑 Webhook secret configuré: ${process.env.STRIPE_WEBHOOK_SECRET ? 'OUI' : 'NON'}`);
});


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

// Endpoint de test pour webhook direct (debugging)
app.post('/webhook-test', express.json(), async (req, res) => {
  console.log('🧪 Test webhook direct reçu');
  
  try {
    const event = req.body;
    
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      console.log('✅ Test - Session:', session.id);
      
      // Traiter comme un vrai webhook
      let customerData = {};
      let itemsData = [];
      
      if (session.metadata?.customer_data) {
        customerData = JSON.parse(session.metadata.customer_data);
      }
      if (session.metadata?.items_data) {
        itemsData = JSON.parse(session.metadata.items_data);
      }
      
      console.log('🧪 Test - Données client:', customerData);
      console.log('🧪 Test - Articles:', itemsData);
      
      // Envoyer l'email de test
      await envoyerEmailConfirmation(customerData, itemsData);
      
      res.json({ message: 'Email de test envoyé avec succès!', received: true });
    } else {
      res.json({ message: 'Type d\'événement non supporté pour le test', received: false });
    }
    
  } catch (error) {
    console.error('❌ Erreur test webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint de test Gmail direct
app.post('/test-email-direct', express.json(), async (req, res) => {
  console.log('📧 Test Gmail direct demandé');
  
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'futbolerovintageshop@gmail.com',
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

    const mailOptions = {
      from: 'futbolerovintageshop@gmail.com',
      to: 'futbolerovintageshop@gmail.com',
      subject: 'Test Direct Gmail - Futbolero',
      html: `
        <h2>🧪 Test Direct Gmail</h2>
        <p>Ce test vérifie que le système Gmail fonctionne correctement.</p>
        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        <p><strong>Configuration:</strong></p>
        <ul>
          <li>Service: Gmail</li>
          <li>User: futbolerovintageshop@gmail.com</li>
          <li>Password: ${process.env.GMAIL_APP_PASSWORD ? 'Configuré' : 'MANQUANT'}</li>
        </ul>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Test Gmail réussi:', info.messageId);
    
    res.json({ 
      success: true, 
      message: 'Email de test envoyé avec succès!',
      messageId: info.messageId 
    });

  } catch (error) {
    console.error('❌ Erreur test Gmail:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: error.toString() 
    });
  }
});

// Endpoint pour simuler webhook
app.post('/simulate-webhook', express.json(), async (req, res) => {
  console.log('🎯 Simulation webhook demandée');
  
  try {
    const event = req.body;
    
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      console.log('✅ Simulation webhook - Session:', session.id);
      
      let customerData = {};
      let itemsData = [];
      
      if (session.metadata?.customer_data) {
        customerData = JSON.parse(session.metadata.customer_data);
      }
      if (session.metadata?.items_data) {
        itemsData = JSON.parse(session.metadata.items_data);
      }
      
      console.log('🎯 Simulation - Données client:', customerData);
      console.log('🎯 Simulation - Articles:', itemsData);
      
      // Envoyer l'email
      await envoyerEmailConfirmation(customerData, itemsData);
      
      res.json({ 
        success: true, 
        message: 'Webhook simulé et email envoyé!',
        sessionId: session.id 
      });
    } else {
      res.json({ 
        success: false, 
        message: 'Type d\'événement non supporté' 
      });
    }
    
  } catch (error) {
    console.error('❌ Erreur simulation webhook:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Endpoint simple pour envoyer un email de commande
app.post('/send-order-email', express.json(), async (req, res) => {
  try {
    const { customer, items, sessionId, source } = req.body;
    
    console.log('📧 Réception demande email:', { customer: customer?.email, items: items?.length, source });
    
    if (!customer || !customer.email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Données client manquantes' 
      });
    }
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Articles manquants' 
      });
    }
    
    // Envoyer l'email de confirmation
    const emailResult = await envoyerEmailConfirmation(customer, items, sessionId || 'direct');
    
    if (emailResult.success) {
      console.log('✅ Email envoyé avec succès via endpoint direct');
      res.json({ 
        success: true, 
        message: 'Email de confirmation envoyé avec succès',
        recipient: customer.email,
        source: source || 'direct'
      });
    } else {
      console.error('❌ Échec envoi email via endpoint:', emailResult.error);
      res.status(500).json({ 
        success: false, 
        error: 'Erreur lors de l\'envoi de l\'email',
        details: emailResult.error
      });
    }
    
  } catch (error) {
    console.error('💥 Erreur endpoint send-order-email:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});
