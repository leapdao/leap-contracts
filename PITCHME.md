@title[Introduction]

# TrueBit: Scalable Computation
<br>
<span class="byline">[ Johann Barbie  ]</span>

--- 


### What is scalability?

- x scales if it performs equally well as it grows
- *blockchains:* every full node has to process every block
- adding nodes does not help

---

### Scalability in Ethereum

*Casper:* scale state space and trnsaction via sharding

*raiden:* scale transactions via state channels

*Truebit:* scale computation via interactive verification

only sharding requires fork

---

### Why Scaleable Computation

Ethereum smart contracts
- witout gas limit
- written in any programming language
- driven by neural networks
- with filesystem access to swarm
- link multiple blockchains (dogecoin)
- verify golem computations
- verify live video encoding (livepeer)

---

### TrueBit has Unanimous Consensus

- single honest virifier can outrule anyone ("99.9% attack")
- presence of honest verifier ensured by economic incentives

Difference to Golem / iExec / Sonm:
- Truebit: scaling up verified computation
- others: using blockchain to pay cloud computation

---

### How to Scale Computation

- only few people perform computation off-chain
- if anyone disagrees, they go to court (blockchain)
- on-chain settling must be magnitudes faster

---

### Verification Game 1

Parties compute Merkle-trees of full state (memory) at every single computation step and submit roots at certain steps

```
step: 		1				1 000 000
Proposer: 	input			output_1
Challenger: input 			output_2
```

---

### Verification Game 2

judge asks for merkle root in middle of exkecution
```
step 		1			500 000		1 000 000
Proposer: 	input		0x1234		output_1
Challenger 	input 		0x1234 		output_2
```

---

### Verification Game 3

binary search continues:
```
step 		..	750 000		625 000	..
Proposer: 	..	0x7328		0x8256	..
Challenger 	..	0x1862		0x8256	..
```

---

### Verification Game 4

=> step in agreement, next step not in agreement
```
step 		..	638 225		638 226	..
Proposer: 	..	0x4321		0x8922	..
Challenger 	..	0x4321		0x8923	..
```

after 20 rounds: agreement -> disagremment in one step 

both submit merkre proofs, smart contract verifies with no effort and finds cheater

---

### The Good News

- 20 rounds can be further reduced
- cheater is found with certainty: large disincentive to cheat
- game will never be played but has to be there as fallback

---


### Problem: Verifier's Dilemma

- only need single verifier, but has to be altruistic
- over time, verifiers will stop looking because system works
- system breaks down

---

### Solution: Forced Errors

- pseudorandomly inject forced errors
- verifiers get reward for finding forced errors
- solver is not punished if forced errors in found

---

### Problem: Information Sharing

- solver can notify certain veriffiers about error
- verifiers can create multiple accounts
- ho to ensure computation was actually run?

---

### Solution: Reduce Reward with every Challenge

- solver can challenge
- total error finding reward is halved for each report

Payouts:
```
1 challenge: 100 = 100
2 challenges: 25 + 25 = 50
3 challenges: 8.333 + 8.333 + 8.333 = 25
...
```


---






