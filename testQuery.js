const mongoose = require('mongoose');
const mongoUri = 'mongodb+srv://server:2JeLjI3MEpUms8K4@cluster0.j4nkvts.mongodb.net/umang?appName=Cluster0/umang';

mongoose.connect(mongoUri)
  .then(async () => {
    const UserSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
    const User = mongoose.model('User', UserSchema);

    const email = 'deepak@operator.com';
    const admin = await User.findOne({
      email,
      role: { $in: ['owner', 'operator', 'superAdmin', 'admin', 'agency', 'coinSeller'] }
    });
    console.log('Result without isDeleted:', admin ? { name: admin.name, isDeleted: admin.isDeleted } : 'null');

    const admin2 = await User.findOne({
      email,
      role: { $in: ['owner', 'operator', 'superAdmin', 'admin', 'agency', 'coinSeller'] },
      isDeleted: false
    });
    console.log('Result with isDeleted: false:', admin2 ? admin2.name : 'null');

    await mongoose.disconnect();
  });
