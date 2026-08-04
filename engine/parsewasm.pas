{ ************************************************************************** }
{                                                                            }
{ parsewasm                                                                  }
{                                                                            }
{ Copyright © 2026 Yuriy Pisarev (ypisareff@outlook.com)                     }
{                                                                            }
{ ************************************************************************** }
library parsewasm;

{$IFDEF FPC}{$MODE DELPHI}{$ENDIF}

uses
  SysUtils, Math, Parser, ParseTypes, ParseUtils, ValueTypes, ValueUtils;

const
  MaxSlots = 64;

var
  P: TMathParser;
  VarX, VarT: Double;
  Slots: array[0..MaxSlots - 1] of record
    Used: Boolean;
    Script: TScript;
  end;
  LastNote: AnsiString;

function WAlloc(Size: LongInt): Pointer; cdecl;
begin
  GetMem(Result, Size);
end;

procedure WFree(Data: Pointer); cdecl;
begin
  FreeMem(Data);
end;

function WPrepare(Text: PAnsiChar; Size: LongInt): LongInt; cdecl;
var
  I: Integer;
  Formula: AnsiString;
begin
  SetString(Formula, Text, Size);
  for I := 0 to MaxSlots - 1 do
    if not Slots[I].Used then
    begin
      try
        P.StringToScript(string(Formula), Slots[I].Script);
      except
        on E: Exception do
        begin
          LastNote := AnsiString(E.Message);
          Exit(-1);
        end;
      end;
      Slots[I].Used := True;
      Exit(I);
    end;
  LastNote := 'no free slots';
  Result := -1;
end;

procedure WDrop(Slot: LongInt); cdecl;
begin
  if (Slot >= 0) and (Slot < MaxSlots) then
  begin
    Slots[Slot].Used := False;
    Slots[Slot].Script := nil;
  end;
end;

function WEval(Slot: LongInt; X: Double): Double; cdecl;
begin
  if (Slot < 0) or (Slot >= MaxSlots) or not Slots[Slot].Used then
    Exit(NaN);
  VarX := X;
  VarT := X;
  try
    Result := GetDouble(P.ExecuteScript(Slots[Slot].Script)^);
  except
    Result := NaN;
  end;
end;

function WSample(Slot: LongInt; Lo, Hi: Double; Count: LongInt; Buffer: PDouble): LongInt; cdecl;
var
  I, Good: Integer;
  Step: Double;
begin
  if (Count < 1) or (Slot < 0) or (Slot >= MaxSlots) or not Slots[Slot].Used then
    Exit(0);
  if Count > 1 then
    Step := (Hi - Lo) / (Count - 1)
  else
    Step := 0;
  Good := 0;
  for I := 0 to Count - 1 do
  begin
    VarX := Lo + Step * I;
    VarT := VarX;
    try
      Buffer^ := GetDouble(P.ExecuteScript(Slots[Slot].Script)^);
      if not IsNan(Buffer^) and not IsInfinite(Buffer^) then Inc(Good);
    except
      Buffer^ := NaN;
    end;
    Inc(Buffer);
  end;
  Result := Good;
end;

function WNote(Buffer: PAnsiChar; Capacity: LongInt): LongInt; cdecl;
var
  Size: Integer;
begin
  Size := Length(LastNote);
  if Size > Capacity then Size := Capacity;
  if Size > 0 then Move(LastNote[1], Buffer^, Size);
  Result := Size;
end;

function PutText(const Text: AnsiString; Buffer: PAnsiChar; Capacity: LongInt): LongInt;
begin
  Result := Length(Text);
  if Result > Capacity then Result := Capacity;
  if Result > 0 then Move(Text[1], Buffer^, Result);
end;

function WOps(Slot: LongInt; Buffer: PAnsiChar; Capacity: LongInt): LongInt; cdecl;
var
  Order: TFunctionOrder;
  AFunction: PFunction;
  Text, Name: AnsiString;
  I, J: Integer;
begin
  if (Slot < 0) or (Slot >= MaxSlots) or not Slots[Slot].Used then Exit(0);
  Helper.GetFunctionArray(Slots[Slot].Script, Order);
  Text := '[';
  for I := Low(Order) to High(Order) do
    if P.GetFunction(Order[I], AFunction) and (AFunction.Method.Parameter.L or
      AFunction.Method.Parameter.R) then
      begin
        Name := AnsiString(AFunction.Name);
        if Pos('"n":"' + Name + '"', Text) > 0 then Continue;
        if Length(Text) > 1 then Text := Text + ',';
        J := AFunction.Handle^;
        Text := Text + '{"h":' + AnsiString(IntToStr(J)) + ',"n":"' + Name + '","p":' +
          AnsiString(IntToStr(Ord(AFunction.Priority.Priority))) + ',"c":' +
          AnsiString(IntToStr(Ord(AFunction.Priority.Coverage))) + '}';
      end;
  Text := Text + ']';
  Result := PutText(Text, Buffer, Capacity);
end;

function WOpSet(Handle, Prio, Cover: LongInt): LongInt; cdecl;
var
  AFunction: PFunction;
begin
  if not P.GetFunction(Handle, AFunction) then Exit(0);
  if (Prio >= Ord(Low(TFunctionPriority))) and (Prio <= Ord(High(TFunctionPriority))) then
    AFunction.Priority.Priority := TFunctionPriority(Prio);
  if (Cover >= Ord(Low(TPriorityCoverage))) and (Cover <= Ord(High(TPriorityCoverage))) then
    AFunction.Priority.Coverage := TPriorityCoverage(Cover);
  Result := 1;
end;

function WUnparse(Slot: LongInt; Buffer: PAnsiChar; Capacity: LongInt): LongInt; cdecl;
begin
  if (Slot < 0) or (Slot >= MaxSlots) or not Slots[Slot].Used then Exit(0);
  try
    Result := PutText(AnsiString(P.ScriptToString(Slots[Slot].Script)), Buffer, Capacity);
  except
    on E: Exception do
    begin
      LastNote := AnsiString(E.Message);
      Result := 0;
    end;
  end;
end;

procedure WPrioritize(Flag: LongInt); cdecl;
begin
  P.Prioritize := Flag <> 0;
end;

exports
  WAlloc name 'walloc',
  WFree name 'wfree',
  WPrepare name 'prepare',
  WDrop name 'drop',
  WEval name 'evalat',
  WSample name 'sample',
  WNote name 'note',
  WOps name 'ops',
  WOpSet name 'opset',
  WUnparse name 'unparse',
  WPrioritize name 'prioritize';

begin
  P := TMathParser.Create(nil);
  P.Cached := False;
  P.AddVariable('X', VarX);
  P.AddVariable('x', VarX);
  P.AddVariable('T', VarT);
  P.AddVariable('t', VarT);
end.
