/** SIG-1464: promote straight to a queen unless Alt asks for the picker. */
export function shouldAutoQueen(autoQueen: boolean, altHeld: boolean): boolean {
  return autoQueen && !altHeld;
}
