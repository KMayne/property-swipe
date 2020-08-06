const router = require('express').Router();
const secrets = require('./secrets.json');

const moveDate = new Date(secrets.moveDate);

router.get('/version', (req, res) => {
  res.json({ version: process.env.PS_VERSION || 'UNVERSIONED' });
});

router.use((req, res, next) => {
  const key = req.query.key;
  if (key && key === req.app.get('loginKey')) {
    return next();
  }
  const error = new Error("User key missing/bad");
  error.status = 403;
  return next(error);
});

router.get('/listings', async (req, res) => {
  const listingsCol = req.app.db.collection('listings');
  const usersCol = req.app.db.collection('users');

  const user = await usersCol.findOne({ username: 'kian' });
  const seenProperties = [...user.starred, ...user.accepted, ...user.rejected];

  const nonSeenProperties = await listingsCol.find({
    listingID: { $nin: seenProperties },
    removed: false,
    // Allow the user to specify a regex on properties
    description: (secrets.descriptionRegex ? { $regex: secrets.descriptionRegex, $options: 'i' } : { $exists: true }),
    // Properties < maxCommuteMins mins away from work
    transitCommuteMins: { $lt: secrets.maxCommuteMins },
    // Properties with no available date or available on or before move in date
    $or: [ { available: { $exists: false } }, { available: { $lte: moveDate } } ]
    // Properties with at least 3 photos
    'photos.2': { $exists: true }
  // Most recently updated price, price low to high
  }, { sort: { 'priceHistory.0.date': -1, price: 1 } });
  res.json(await nonSeenProperties.toArray());
});

router.get('/available', async (req, res) => {
  const listingsCol = req.app.db.collection('listings');
  const availableProperties = await listingsCol.find({ removed: false });
  res.json((await availableProperties.toArray()).map(listing => listing.listingID));
});

router.get('/user', async (req, res) => {
  const usersCol = req.app.db.collection('users');
  const user = await usersCol.findOne({ username: 'kian' });
  res.json(user);
});

router.put('/user', async (req, res) => {
  const usersCol = req.app.db.collection('users');
  const user = req.body;
  delete user._id;
  usersCol.findOneAndReplace({ username: 'kian' }, user)
    .then(() => res.sendStatus(204))
    .catch(err => res.status(500).json(err));
});

module.exports = router;
