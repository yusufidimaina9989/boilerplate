import {
    ByteString,
    FixedArray,
    HashedMap,
    HashedSet,
    PubKey,
    Sha256,
    Sig,
    SmartContract,
    assert,
    hash256,
    method,
    prop,
} from 'scrypt-ts'

export type Candidate = {
    name: ByteString
    votesReceived: bigint
}

export class ConfidentialVoting extends SmartContract {
    @prop()
    voters: HashedSet<PubKey>

    @prop(true)
    voteCommits: HashedMap<PubKey, Sha256>

    @prop(true)
    voteRevealed: boolean

    @prop(true)
    candidates: FixedArray<Candidate, 2>

    @prop()
    VoteDeadline: bigint

    @prop()
    revealDeadline: bigint

    @prop(true)
    voteFinished: boolean

    constructor(
        voters: HashedSet<PubKey>,
        candidates: FixedArray<Candidate, 2>,
        voteCommits: HashedMap<PubKey, Sha256>,
        voteDeadline: bigint,
        revealDeadline: bigint
    ) {
        super(...arguments)
        this.voters = voters
        this.voteRevealed = false
        this.voteCommits = voteCommits
        this.VoteDeadline = voteDeadline
        this.revealDeadline = revealDeadline
        this.voteFinished = false
        this.candidates = candidates
    }

    @method()
    public vote(voter: PubKey, voteCommitment: Sha256, sig: Sig) {
        // Check if voting is still allowed
        assert(!this.voteRevealed, 'Voting is already closed')

        // check if the passed public key is in the set of chosen voters
        assert(this.voters.has(voter), 'pubkey not in the set of chosen voters')

        // Verify if the voter is elliglble
        assert(!this.voteCommits.has(voter))

        // Store the commit associated with the voter
        this.voteCommits.set(voter, voteCommitment)

        // Check voter signature
        assert(this.checkSig(sig, voter))

        //propagate the state
        let output =
            this.buildStateOutput(this.ctx.utxo.value) +
            this.buildChangeOutput()

        assert(hash256(output) == this.ctx.hashOutputs, 'hashOutputs mismatch')
    }

    @method()
    public reveal(
        voter: PubKey,
        vote: Sha256,
        salt: ByteString,
        candidateIdx: bigint
    ) {
        const voteCommitment = hash256(vote + salt)

        if (this.voteCommits.size === this.voters.size) {
            // Marked voting as revealed
            this.voteRevealed = true
            //check if the pubkey contained the passed commitment
            assert(this.voteCommits.canGet(voter, voteCommitment))

            // Update vote count
            assert(
                candidateIdx >= 0 && candidateIdx < this.candidates.length,
                'Invalid candidate index'
            )
            this.candidates[Number(candidateIdx)].votesReceived++
        } else {
            this.voteRevealed = false
        }

        // Check if voting deadline has passed
        assert(
            this.timeLock(this.VoteDeadline),
            'Voting deadline has not passed'
        )
    }

    @method()
    public finish(candidateIdx: bigint) {
        // candidate with the most votes wins

        if (
            Number(this.candidates[Number(0)].votesReceived) >
            Number(this.candidates[Number(candidateIdx)].votesReceived)
        )
            // log the winner
            console.log('Winner:', this.candidates[Number(0)].name)

        this.voteFinished = true
        // Ensure voting has been revealed
        assert(this.voteRevealed, 'Voting has not been revealed yet')
    }
}
