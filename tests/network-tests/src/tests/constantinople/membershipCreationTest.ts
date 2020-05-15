import { WsProvider } from '@polkadot/api';
import { registerJoystreamTypes } from '@joystream/types';
import { Keyring } from '@polkadot/keyring';
import { assert } from 'chai';
import { KeyringPair } from '@polkadot/keyring/types';
import BN = require('bn.js');
import { ApiWrapper } from '../../utils/apiWrapper';
import { initConfig } from '../../utils/config';
import { v4 as uuid } from 'uuid';
import tap from 'tap';

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

  tap.test('Buy membership setup', async t => {
    // t.setTimeout(defaultTimeout);
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
  });

  tap.test('Buy membeship is accepted with sufficient funds', async t => {
    // t.setTimeout(defaultTimeout);
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
  });

  tap.test('Account A can not buy the membership with insufficient funds', async t => {
    // t.setTimeout(defaultTimeout);
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
  });

  tap.test('Account A was able to buy the membership with sufficient funds', async t => {
    // t.setTimeout(defaultTimeout);
    await apiWrapper.transferBalance(sudo, aKeyPair.address, membershipFee.add(membershipTransactionFee));
    apiWrapper
      .getBalance(aKeyPair.address)
      .then(balance =>
        assert(balance.toBn() >= membershipFee, 'The account balance is insufficient to purchase membership')
      );
    await apiWrapper.buyMembership(aKeyPair, paidTerms, `late_member_${aKeyPair.address.substring(0, 8)}`);
    apiWrapper
      .getMemberIds(aKeyPair.address)
      .then(membership => assert(membership.length > 0, 'Account A is a not member'));
  });

  tap.teardown(() => {
    apiWrapper.close();
  });
}

tap.setTimeout(60000);
const nKeyPairs: KeyringPair[] = new Array();
membershipTest(nKeyPairs);

// describe.skip('Membership integration tests', () => {
//   const nKeyPairs: KeyringPair[] = new Array();
//   membershipTest(nKeyPairs);
// });
