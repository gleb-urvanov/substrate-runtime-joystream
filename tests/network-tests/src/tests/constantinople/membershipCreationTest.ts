import { WsProvider } from '@polkadot/api';
import { registerJoystreamTypes } from '@joystream/types';
import { Keyring } from '@polkadot/keyring';
import { assert } from 'chai';
import { KeyringPair } from '@polkadot/keyring/types';
import BN = require('bn.js');
import { ApiWrapper } from '../../utils/apiWrapper';
import { initConfig } from '../../utils/config';
import { v4 as uuid } from 'uuid';
import { step } from 'mocha-steps';

export function membershipTest(nKeyPairs: KeyringPair[]) {
  initConfig();
  const keyring = new Keyring({ type: 'sr25519' });
  const N: number = +process.env.MEMBERSHIP_CREATION_N!;
  const paidTerms: number = +process.env.MEMBERSHIP_PAID_TERMS!;
  const nodeUrl: string = process.env.NODE_URL!;
  const sudoUri: string = process.env.SUDO_ACCOUNT_URI!;
  const defaultTimeout: number = 30000;
  let apiWrapper: ApiWrapper;
  let sudo: KeyringPair;
  let aKeyPair: KeyringPair;
  let membershipFee: BN;
  let membershipTransactionFee: BN;

  step('\n\tSetup membership creation test', async () => {
    registerJoystreamTypes();
    const provider = new WsProvider(nodeUrl);
    apiWrapper = await ApiWrapper.create(provider);
    sudo = keyring.addFromUri(sudoUri);
    for (let i = 0; i < N; i++) {
      nKeyPairs.push(keyring.addFromUri(i + uuid().substring(0, 8)));
    }
    aKeyPair = keyring.addFromUri(uuid().substring(0, 8));
    membershipFee = await apiWrapper.getMembershipFee(paidTerms);
    membershipTransactionFee = apiWrapper.estimateBuyMembershipFee(
      sudo,
      paidTerms,
      'member_name_which_is_longer_than_expected'
    );
    await apiWrapper.transferBalanceToAccounts(sudo, nKeyPairs, membershipTransactionFee.add(new BN(membershipFee)));
    await apiWrapper.transferBalance(sudo, aKeyPair.address, membershipTransactionFee);
  }).timeout(defaultTimeout);

  step('\n\tBuy membeship is accepted with sufficient funds', async () => {
    await Promise.all(
      nKeyPairs.map(async (keyPair, index) => {
        await apiWrapper.buyMembership(keyPair, paidTerms, `new_member_${index}${keyPair.address.substring(0, 8)}`);
      })
    );
    nKeyPairs.forEach((keyPair, index) =>
      apiWrapper
        .getMemberIds(keyPair.address)
        .then(membership => assert(membership.length > 0, `Account ${keyPair.address} is not a member`))
    );
    assert.fail('failed as planned');
  }).timeout(defaultTimeout);

  step('\n\tAccount A can not buy the membership with insufficient funds', async () => {
    await apiWrapper
      .getBalance(aKeyPair.address)
      .then(balance =>
        assert(
          balance.toBn() < membershipFee.add(membershipTransactionFee),
          'Account A already have sufficient balance to purchase membership'
        )
      );
    await apiWrapper.buyMembership(aKeyPair, paidTerms, `late_member_${aKeyPair.address.substring(0, 8)}`, true);
    apiWrapper
      .getMemberIds(aKeyPair.address)
      .then(membership => assert(membership.length === 0, 'Account A is a member'));
  }).timeout(defaultTimeout);

  step('\n\tAccount A was able to buy the membership with sufficient funds', async () => {
    await apiWrapper.transferBalance(sudo, aKeyPair.address, membershipFee.add(membershipTransactionFee));
    apiWrapper
      .getBalance(aKeyPair.address)
      .then(balance =>
        assert(balance.toBn() >= membershipFee, 'The account balance is insufficient to purchase membership')
      );
    await apiWrapper.buyMembership(aKeyPair, paidTerms, `late_member_${aKeyPair.address.substring(0, 8)}`);
    const membership = await apiWrapper.getMemberIds(aKeyPair.address);
    assert(membership.length < 0, 'Account A is a not member');
    // apiWrapper
    //   .getMemberIds(aKeyPair.address)
    //   .then(membership => assert(membership.length < 0, 'Account A is a not member'));
  }).timeout(defaultTimeout);

  after(() => {
    apiWrapper.close();
  });
}

describe('Membership integration tests', () => {
  const nKeyPairs: KeyringPair[] = new Array();
  membershipTest(nKeyPairs);
});
