{ ************************************************************************** }
{                                                                            }
{ export_curves                                                              }
{                                                                            }
{ Copyright © 2026 Yuriy Pisarev (ypisareff@outlook.com)                     }
{                                                                            }
{ ************************************************************************** }
program export_curves;

{$APPTYPE CONSOLE}
{$IFDEF FPC}{$MODE DELPHI}{$ENDIF}

uses
  {$IFDEF UNIX}{$IFDEF FPC}cthreads,{$ENDIF}{$ENDIF}
  SysUtils, Math, StrUtils, Classes,
  Parser, ParseTypes, ValueTypes, ValueUtils;

type
  TCurve = record
    Key: string;
    Title: string;
    Formula: string;
    Polar: Boolean;
    Lo, Hi: Double;
    Steps: Integer;
    Clamp: Double;
    MaxJump: Double;
  end;

const
  Pi2 = Pi * 2;
  Curves: array[0..17] of TCurve = (
    (Key: 'maurer-6-71'; Title: 'Maurer rose · n=6, d=71';
    Formula: 'Sin (6 * T)'; Polar: True; Lo: 0; Hi: 142 * Pi; Steps: 360; Clamp: 4; MaxJump: 0),
    (Key: 'maurer-5-97'; Title: 'Maurer rose · n=5, d=97';
    Formula: 'Sin (5 * T)'; Polar: True; Lo: 0; Hi: 194 * Pi; Steps: 360; Clamp: 4; MaxJump: 0),
    (Key: 'maurer-2-39'; Title: 'Maurer rose · n=2, d=39';
    Formula: 'Sin (2 * T)'; Polar: True; Lo: 0; Hi: 78 * Pi; Steps: 360; Clamp: 4; MaxJump: 0),
    (Key: 'maurer-12-163'; Title: 'Maurer rose · n=12, d=163';
    Formula: 'Sin (12 * T)'; Polar: True; Lo: 0; Hi: 326 * Pi; Steps: 360; Clamp: 4; MaxJump: 0),

    (Key: 'butterfly'; Title: 'Butterfly · Temple Fay, 1989';
    Formula: 'Exp (Sin T) - 2 * Cos (4 * T) + Sin ((2 * T - Pi) / 24) ** 5';
    Polar: True; Lo: 0; Hi: 24 * Pi; Steps: 14000; Clamp: 8; MaxJump: 0),

    (Key: 'rose-7-4'; Title: 'Rose · k = 7/4';
    Formula: 'Cos (7 * T / 4)'; Polar: True; Lo: 0; Hi: 8 * Pi; Steps: 7000; Clamp: 4; MaxJump: 1),
    (Key: 'rose-13-8'; Title: 'Rose · k = 13/8';
    Formula: 'Cos (13 * T / 8)'; Polar: True; Lo: 0; Hi: 16 * Pi; Steps: 12000; Clamp: 4; MaxJump: 1),
    (Key: 'rose-moire'; Title: 'Moire rose · k = 31/30';
    Formula: 'Cos (31 * T / 30)'; Polar: True; Lo: 0; Hi: 60 * Pi; Steps: 26000; Clamp: 4; MaxJump: 1),
    (Key: 'rose-layered'; Title: 'Layered rose · sin 7t · cos t/5';
    Formula: 'Sin (7 * T) * Cos (T / 5)'; Polar: True; Lo: 0; Hi: 10 * Pi; Steps: 9000; Clamp: 4; MaxJump: 1),

    (Key: 'lemniscate'; Title: 'Lemniscate of Bernoulli';
    Formula: 'Sqrt (Cos (2 * T))'; Polar: True; Lo: 0; Hi: Pi2; Steps: 4000; Clamp: 4; MaxJump: 0.5),
    (Key: 'log-spiral'; Title: 'Logarithmic spiral · spira mirabilis';
    Formula: 'Exp (0.15 * T)'; Polar: True; Lo: 0; Hi: 8 * Pi; Steps: 5000; Clamp: 60; MaxJump: 0),
    (Key: 'fermat'; Title: 'Fermat spiral';
    Formula: 'Sqrt (T)'; Polar: True; Lo: 0; Hi: 30 * Pi; Steps: 9000; Clamp: 20; MaxJump: 0),
    (Key: 'cochleoid'; Title: 'Cochleoid · sin t / t';
    Formula: 'Sin (T) / T'; Polar: True; Lo: 0.0015; Hi: 6 * Pi; Steps: 6000; Clamp: 4; MaxJump: 0.5),
    (Key: 'cassini'; Title: 'Cassini oval · caught mid-pinch';
    Formula: 'Sqrt (Cos (2 * T) + Sqrt (1.02 ** 4 - Sin (2 * T) ** 2))';
    Polar: True; Lo: 0; Hi: Pi2; Steps: 4000; Clamp: 4; MaxJump: 0.5),

    (Key: 'weierstrass'; Title: 'Weierstrass function · continuous, nowhere smooth';
    Formula: 'Cos (Pi * X) + Cos (3 * Pi * X) / 2 + Cos (9 * Pi * X) / 4 + Cos (27 * Pi * X) / 8';
    Polar: False; Lo: -1.5; Hi: 1.5; Steps: 12000; Clamp: 8; MaxJump: 0),
    (Key: 'takagi'; Title: 'Blancmange curve · built from floor';
    Formula: 'Abs (X - Floor (X) - 0.5) + Abs (2 * X - Floor (2 * X) - 0.5) / 2 + ' +
    'Abs (4 * X - Floor (4 * X) - 0.5) / 4 + Abs (8 * X - Floor (8 * X) - 0.5) / 8 + ' +
    'Abs (16 * X - Floor (16 * X) - 0.5) / 16';
    Polar: False; Lo: 0; Hi: 3; Steps: 12000; Clamp: 4; MaxJump: 0),
    (Key: 'wave-packet'; Title: 'Wave packet · sin x · sin 16x';
    Formula: 'Sin (X) * Sin (16 * X)'; Polar: False; Lo: -Pi2; Hi: Pi2; Steps: 12000; Clamp: 4; MaxJump: 0),

    (Key: 'x-sin-x'; Title: 'Damped spiral · x sin x';
    Formula: 'X * Sin X'; Polar: False; Lo: -16; Hi: 16; Steps: 5000; Clamp: 30; MaxJump: 0)
  );

var
  P: TMathParser;
  XVar, TVar: Double;
  Output: TStringList;

function Sample(const C: TCurve): string;
var
  I: Integer;
  U, Value, Vx, Vy, PrevX, PrevY: Double;
  Script: TScript;
  Segs, Cur: TStringList;
  Broke, HasPrev: Boolean;

  procedure FlushSeg;
  begin
    if Cur.Count >= 2 then Segs.Add('[' + Cur.CommaText.Replace('"', '') + ']');
    Cur.Clear;
  end;

begin
  Segs := TStringList.Create;
  Cur := TStringList.Create;
  try
    try
      P.StringToScript(C.Formula, Script);
    except
      on E: Exception do
      begin
        Writeln('    PARSE ERROR: ', E.Message);
        Exit('{"ok":false}');
      end;
    end;
    HasPrev := False;
    PrevX := 0;
    PrevY := 0;
    for I := 0 to C.Steps do
    begin
      U := C.Lo + (C.Hi - C.Lo) * I / C.Steps;
      if C.Polar then TVar := U else XVar := U;
      Broke := False;
      Value := NaN;
      try
        Value := GetDouble(P.ExecuteScript(Script)^);
      except
        Broke := True;
      end;
      if Broke or IsNan(Value) or IsInfinite(Value) or (Abs(Value) > C.Clamp) then
      begin
        FlushSeg;
        HasPrev := False;
        Continue;
      end;
      if C.Polar then
      begin
        Vx := Value * Cos(U);
        Vy := Value * Sin(U);
      end
      else begin
        Vx := U;
        Vy := Value;
      end;
      if HasPrev and (C.MaxJump > 0) and (Sqrt(Sqr(Vx - PrevX) + Sqr(Vy - PrevY)) > C.MaxJump) then
        FlushSeg;
      Cur.Add(Format('%.4f,%.4f', [Vx, Vy], TFormatSettings.Invariant));
      PrevX := Vx;
      PrevY := Vy;
      HasPrev := True;
    end;
    FlushSeg;
    Result := Format('{"ok":true,"polar":%s,"segs":[%s]}', [LowerCase(BoolToStr(C.Polar, True)), Segs.CommaText.Replace('"', '')]);
  finally
    Segs.Free; Cur.Free;
  end;
end;

procedure Emit(const C: TCurve);
var
  Data, Comma: string;
  Points: Integer;
begin
  Data := Sample(C);
  Comma := IfThen(Output.Count > 0, ',', '');
  Output.Add(
    Format(
      '%s{"key":"%s","title":%s,"text":%s,"polar":%s,"data":%s}',
      [
        Comma,
        C.Key,
        '"' + C.Title.Replace('"', '\"') + '"',
        '"' + C.Formula.Replace('\', '\\').Replace('"', '\"') + '"',
        LowerCase(BoolToStr(C.Polar, True)),
        Data
      ]
    )
  );
  Points := 0;
  for var Ch in Data do if Ch = ',' then Inc(Points);
  Writeln(Format('  %-16s %5d steps  %s', [C.Key, C.Steps, Copy(C.Formula, 1, 44)]));
end;

var
  I: Integer;
begin
  P := TMathParser.Create(nil);
  Output := TStringList.Create;
  try
    P.AddVariable('X', XVar);
    P.AddVariable('x', XVar);
    P.AddVariable('T', TVar);
    P.AddVariable('t', TVar);
    Writeln('=== the engine computes the curves ===');
    for I := Low(Curves) to High(Curves) do Emit(Curves[I]);
    Output.Insert(0, 'window.CURVES = [');
    Output.Add('];');
    Output.SaveToFile(ExtractFilePath(ParamStr(0)) + 'data.js');
    Writeln('=== data.js written: ', High(Curves) - Low(Curves) + 1, ' curves ===');
  finally
    Output.Free; P.Free;
  end;
end.
