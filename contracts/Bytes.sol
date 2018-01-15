library Bytes {

    function concat(bytes memory self, bytes memory bts) internal view returns (bytes memory newBts) {
        uint totLen = self.length + bts.length;
        if (totLen == 0)
            return;
        newBts = new bytes(totLen);
        assembly {
                let i := 0
                let inOffset := 0
                let outOffset := add(newBts, 0x20)
                let words := 0
                let tag := tag_bts
            tag_self:
                inOffset := add(self, 0x20)
                words := div(add(mload(self), 31), 32)
                jump(tag_loop)
            tag_bts:
                i := 0
                inOffset := add(bts, 0x20)
                outOffset := add(newBts, add(0x20, mload(self)))
                words := div(add(mload(bts), 31), 32)
                tag := tag_end
            tag_loop:
                jumpi(tag, gt(i, words))
                {
                    let offset := mul(i, 32)
                    outOffset := add(outOffset, offset)
                    mstore(outOffset, mload(add(inOffset, offset)))
                    i := add(i, 1)
                }
                jump(tag_loop)
            tag_end:
                mstore(add(newBts, add(totLen, 0x20)), 0)
        }
    }

    function uintToBytes(uint self) internal pure returns (bytes memory s) {
        uint maxlength = 100;
        bytes memory reversed = new bytes(maxlength);
        uint i = 0;
        while (self != 0) {
            uint remainder = self % 10;
            self = self / 10;
            reversed[i++] = byte(48 + remainder);
        }
        s = new bytes(i);
        for (uint j = 0; j < i; j++) {
            s[j] = reversed[i - 1 - j];
        }
        return s;
    }
}