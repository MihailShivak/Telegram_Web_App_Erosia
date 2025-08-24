const axios = require('axios');

let tokenCache = null;
let tokenExpiresAt = 0;

async function getCdekToken() {
  if (tokenCache && Date.now() < tokenExpiresAt) {
    return tokenCache;
  }

  try {
    const res = await axios.post('https://api.cdek.ru/v2/oauth/token', {
      grant_type: 'client_credentials',
      client_id: process.env.CDEK_CLIENT_ID,
      client_secret: process.env.CDEK_CLIENT_SECRET
    });

    tokenCache = res.data.access_token;
    tokenExpiresAt = Date.now() + res.data.expires_in * 1000;
    return tokenCache;
  } catch (err) {
    console.error('Ошибка получения токена CDEK:', err.message);
    throw new Error('CDEK auth failed');
  }
}

async function validatePickupPoint(code) {
  try {
    const token = await getCdekToken();
    const res = await axios.get(
      `https://api.cdek.ru/v2/deliverypoints?code=${code}`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    if (res.data && res.data.length > 0) {
      const point = res.data[0];
      return {
        code: point.code,
        address: point.location?.address_full || '',
        city: point.location?.city || '',
        postal_code: point.location?.postal_code || ''
      };
    }

    return null;
  } catch (err) {
    console.error('Ошибка запроса ПВЗ в CDEK:', err.message);
    return null;
  }
}

module.exports = { validatePickupPoint };
