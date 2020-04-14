import { initConfig } from '../utils/config';
import { Keyring, WsProvider } from '@polkadot/api';
import { KeyringPair } from '@polkadot/keyring/types';
import { membershipTest } from './membershipCreationTest';
import { councilTest } from './electingCouncilTest';
import { registerJoystreamTypes } from '@joystream/types';
import { ApiWrapper } from '../utils/apiWrapper';
import BN = require('bn.js');

describe('Text proposal integration tests', () => {
  initConfig();
  const keyring = new Keyring({ type: 'sr25519' });
  const nodeUrl: string = process.env.NODE_URL!;
  const sudoUri: string = process.env.SUDO_ACCOUNT_URI!;
  //TODO stake should be calculated!
  const proposalStake: BN = new BN(+process.env.RUNTIME_UPGRADE_PROPOSAL_STAKE!);
  const defaultTimeout: number = 120000;

  const m1KeyPairs: KeyringPair[] = new Array();
  const m2KeyPairs: KeyringPair[] = new Array();

  let apiWrapper: ApiWrapper;
  let sudo: KeyringPair;

  before(async function () {
    this.timeout(defaultTimeout);
    registerJoystreamTypes();
    const provider = new WsProvider(nodeUrl);
    apiWrapper = await ApiWrapper.create(provider);
  });

  membershipTest(m1KeyPairs);
  membershipTest(m2KeyPairs);
  councilTest(m1KeyPairs, m2KeyPairs);

  it('Upgrading the runtime test', async () => {
    // Setup
    sudo = keyring.addFromUri(sudoUri);
    const proposalText: string = 'Testing proposal';
    const description: string = 'Testing text proposal description';
    const proposalTitle: string = 'Testing text proposal';
    const runtimeProposalFee: BN = apiWrapper.estimateProposeTextFee(
      proposalStake,
      description,
      description,
      proposalText
    );
    const runtimeVoteFee: BN = apiWrapper.estimateVoteForProposalFee();

    // Topping the balances
    await apiWrapper.transferBalance(sudo, m2KeyPairs[0].address, runtimeProposalFee.add(proposalStake));
    await apiWrapper.transferBalanceToAccounts(sudo, m2KeyPairs, runtimeVoteFee);

    // Proposal creation
    console.log('alice mem id is ' + (await apiWrapper.getMemberIds(sudo.address))[0]);
    console.log('proposing new text');
    const proposalPromise = apiWrapper.expectProposalCreated();
    console.log('sending extr');
    await apiWrapper.proposeText(m2KeyPairs[0], proposalStake, proposalTitle, description, proposalText);
    console.log('proposal sent');
    const proposalNumber = await proposalPromise;
    console.log('proposed');

    // Approving runtime update proposal
    console.log('approving new runtime');
    const runtimePromise = apiWrapper.expectProposalStatusUpdated();
    await apiWrapper.batchApproveProposal(m2KeyPairs, proposalNumber);
    await runtimePromise;
  }).timeout(defaultTimeout);

  //membershipTest(new Array<KeyringPair>());

  after(() => {
    apiWrapper.close();
  });
});
