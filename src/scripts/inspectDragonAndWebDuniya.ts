import mongoose from 'mongoose';
import { User } from '../models/user.model';
import { config } from '../configs/envConfig';

async function inspectAndSetup() {
    await mongoose.connect(config.MONGO_URI || 'mongodb://localhost:27017/mithichat');
    console.log('==================================================');
    console.log('🔍 PRE-TEST INSPECTION & BALANCE INITIALIZATION');
    console.log('==================================================');

    let dragon = await User.findOne({ name: /dragon/i });
    if (!dragon) {
        // Create Dragon user if not present
        dragon = await User.create({
            name: 'Dragon',
            phoneNumber: '+919876543210',
            role: 'user',
            coins: 0,
            diamonds: 500,
        });
    } else {
        // Reset Dragon diamonds to exactly 500
        dragon = await User.findByIdAndUpdate(
            dragon._id,
            { $set: { coins: 0, diamonds: 500 } },
            { new: true }
        );
    }

    let webDuniya = await User.findOne({ name: /web.*duniya/i });
    if (!webDuniya) {
        // Create Web Duniya host if not present
        webDuniya = await User.create({
            name: 'Web Duniya',
            phoneNumber: '+919876543211',
            role: 'host',
            coins: 0,
            diamonds: 0,
        });
    } else {
        // Reset Web Duniya coins to 0
        webDuniya = await User.findByIdAndUpdate(
            webDuniya._id,
            { $set: { coins: 0 } },
            { new: true }
        );
    }

    const d = dragon as any;
    const w = webDuniya as any;

    console.log('\n🐉 DEVICE A USER (DRAGON):');
    console.log(`   _id:       ${d._id}`);
    console.log(`   userId:    ${d.userId}`);
    console.log(`   name:      ${d.name}`);
    console.log(`   role:      ${d.role}`);
    console.log(`   diamonds:  ${d.diamonds}`);
    console.log(`   coins:     ${d.coins}`);
    console.log(`   isOnline:  ${d.isOnline}`);

    console.log('\n🎙️ DEVICE B USER (WEB DUNIYA):');
    console.log(`   _id:       ${w._id}`);
    console.log(`   userId:    ${w.userId}`);
    console.log(`   name:      ${w.name}`);
    console.log(`   role:      ${w.role}`);
    console.log(`   diamonds:  ${w.diamonds}`);
    console.log(`   coins:     ${w.coins}`);
    console.log(`   isOnline:  ${w.isOnline}`);

    console.log('\n==================================================');
    await mongoose.disconnect();
}

inspectAndSetup().catch(err => {
    console.error('Inspection Error:', err);
    mongoose.disconnect();
});
