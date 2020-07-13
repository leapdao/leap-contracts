import EVMRevert from './helpers/EVMRevert';

require('./helpers/setup');

const PoaOperator = artifacts.require('PoaOperator');

contract('PoaOperator', (accounts) => {

    // Coverage imporvement tests for PoaOperator
    describe('PoaOperatorBlackboxTest', () => {
        it('should allow to call admin', async () => {
            const opCont = await PoaOperator.new();
            await opCont.admin().should.be.fulfilled;
        });

        it('should allow to call rebuildTakenSlots', async () => {
            const opCont = await PoaOperator.new();
            await opCont.rebuildTakenSlots().should.be.fulfilled;
        });

        it('should allow to call getChallenge', async () => {
            const opCont = await PoaOperator.new();
            const period = '0x5555d580d883cd61e5524ff1df196ce0ed23626b686bc668130ce16c9ed26878';
            const soltId = '82654956586936106715336015473683313038482692133812254480646352323674052559261';
            await opCont.getChallenge(period, soltId).should.be.fulfilled;
        });

        it('should report revert on out of range slotId when calling activate', async () => {
            const opCont = await PoaOperator.new();
            const soltId = '8032076188665725564939398604533502267177423370406416178793564475950438857755';
            await opCont.activate(soltId).should.be.rejectedWith(EVMRevert);
        });

        it('should report revert on incorrect number of sigs when calling submitPeriodWithCas', async () => {
            const opCont = await PoaOperator.new();
            const soltId = '5078301684846261142875433558805966033465097842417102562482887867169684516905';
            const prevHash = '0x4c4f80cea01abfe7e42cca0cee4cbf3bb419625efb1e5fb365401bc87aa7d0b8';
            const blocksRoot = '0xfcf48040b8dd29b0738c741aef2766e0944e294a661da796d8d2014269991a60';
            const casBitmap = '0x33780daddef3e16b79b15f051e0ffa47c626155a081644422e791854d7f3679d';
            await opCont.submitPeriodWithCas(soltId, prevHash, blocksRoot, casBitmap).should.be.rejectedWith(EVMRevert);
        });

        it('should report revert on challenge does not exist when calling respondCas', async () => {
            const opCont = await PoaOperator.new();
            const consensusRoot = '0x9cfb016889a06f961b6bf8967d7988d1c6758316c58e32ec89ebb663942d5a12';
            const casRoot = '0x46448c6f90aa08ee7d9b7577c4a4b6d8fbe3d1a5fed0bcf82a812f2bdd9fc5f9';
            const slotId = '45787621190087643350757677919308745866400176652826505381000963348850357235720';
            const v = '135';
            const r = '0xf725c8cc712ac9b66d8941bc33b8a5f4a80248d68e162d8f79fc951f59d814dc';
            const s = '0x61247eecf768fbeb4b58f0a739781fe595a9bf56fc0f192d66cef00430142ed7';
            const msgSender = '0x81eb1eee77b57f6a59b55b5874d76c2e44410f29';
            await opCont.respondCas(consensusRoot, casRoot, slotId, v, r, s, msgSender).should.be.rejectedWith(EVMRevert);
        });

        it('should report revert on challenge does not exist when calling timeoutBeat', async () => {
            const opCont = await PoaOperator.new();
            const soltId = '66096963138803229613598439751420564186338188037410603654428385995295456347723';
            await opCont.timeoutBeat(soltId).should.be.rejectedWith(EVMRevert);
        });

        it('should allow to call slots', async () => {
            const opCont = await PoaOperator.new();
            const arg = '12972790485340737301009263833548677761753279364737079662251381050400235077548';
            await opCont.slots(arg).should.be.fulfilled;
        });

        it('should allow to call beatChallenges', async () => {
            const opCont = await PoaOperator.new();
            const arg = '0x8e7eefeffe22a7d253ef657e448b5de265845fd7';
            await opCont.beatChallenges(arg).should.be.fulfilled;
        });

        it('should report revert on No active challenge for this slot when calling respondBeat', async () => {
            const opCont = await PoaOperator.new();
            const inclusionProof = ['0x7a1653a96d7c6cceab5b8187911227997ff1f6aad004433077385ce371786591'];
            const walkProof = ['0x844a3a3211f05dfeaa6d9d7b00e43044afb60c314174171892b19adf9c65afe7'];
            const soltId = '65899483317127080191777349741061613436377182008172853121548846142867048394456';
            await opCont.respondBeat(inclusionProof, walkProof, soltId).should.be.rejectedWith(EVMRevert);
        });

        it('should report revert on Incorrect slotId when calling submitPeriod', async () => {
            const opCont = await PoaOperator.new();
            const soltId = '39506155173245819664553035600242331625476597854286062473683796477246641265212';
            const prevHash = '0x55650b8aed02dc196fd849d715f8fcdd7ba4fca7e93cce077b48cff46defc0d9';
            const blocksRoot = '0x7170a1b7d07ad1cab7b0a5141393951f2bf9d90abaef7626282de9579d5a1e45';
            await opCont.submitPeriod(soltId, prevHash, blocksRoot).should.be.rejectedWith(EVMRevert);
        });

        it('should report revert on challenge does not exist when calling timeoutCas', async () => {
            const opCont = await PoaOperator.new();
            const period = '0x610a0abede0351e266cbaa2bc3a26ff293ca27b80bda9ba2cb200f112d4fb1bf';
            const slotId = '53634946611604695624525486819574453366820545368539934645525813240045335854675';
            await opCont.timeoutCas(period, slotId).should.be.rejectedWith(EVMRevert);
        });

        it('should report revert when calling challengeCas', async () => {
            const opCont = await PoaOperator.new();
            const casBitmap = '0xbd131ca4ecf8c32a0b7751cc20f474cd0e34e5f45aeaa291d9c63ebb5f74beac';
            const validatorRoot = '0xec213e022c3c45af68e69fd556d745d1d5dce89826ab3a8570afef8e52119d5a';
            const consensusRoot = '0x23e2f1829865aaa89f06eb9c6e9af9a0614aa1fa78916f9d04a4d9e23331cb6f';
            const slotId = '86843144306006733031941977396277015290271500540377898454844841942118489382333';
            await opCont.challengeCas(casBitmap, validatorRoot, consensusRoot, slotId).should.be.rejectedWith(EVMRevert);
        });

        it('should report revert when calling challengeBeat', async () => {
            const opCont = await PoaOperator.new();
            const slotId = '18962357517774460348172575854180636019629531227998034609667901390563605846630';
            await opCont.challengeBeat(slotId).should.be.rejectedWith(EVMRevert);
        });

        it('should not allow to call setSlot without admin permission', async () => {
            const opCont = await PoaOperator.new();
            const soltId = '105834233287866323199218845538380151036780250840040182071269260396858569988258';
            const signerAddr = '0x3a96fdc33956b73ce2d31bfdd7d8893ec660058d';
            const tenderAddr = '0xbd2e44616f8bdab8e96fe277cb98cef5a55bd3c70f79d1673ca5fbc13ec657df';
            await opCont.setSlot(soltId, signerAddr, tenderAddr).should.be.rejectedWith(EVMRevert);
        });

        it('should not allow to call setHeartbeatParams without admin permission', async () => {
            const opCont = await PoaOperator.new();
            const minimumPulse = '8774905532408334988099056589640900386515676986713027942054187044780534717717';
            const heartbeatColor = '60346';
            await opCont.setHeartbeatParams(minimumPulse, heartbeatColor).should.be.rejectedWith(EVMRevert);
        });

        it('should not allow to call setCasChallengeDuration without admin permission', async () => {
            const opCont = await PoaOperator.new();
            const casChallengeDuration = '93137694511992174157814640766695190766151790144052025893755180040637847405846';
            await opCont.setCasChallengeDuration(casChallengeDuration).should.be.rejectedWith(EVMRevert);
        });


    });

});
